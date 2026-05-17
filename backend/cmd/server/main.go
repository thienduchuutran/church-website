package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/joho/godotenv"

	"github.com/thienduchuutran/church-website/backend/internal/handler"
	appMiddleware "github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/service"
	"github.com/thienduchuutran/church-website/backend/internal/storage"
	"github.com/thienduchuutran/church-website/backend/migrations"
	"github.com/thienduchuutran/church-website/backend/pkg/database"
)

// runMigrations applies all pending up-migrations from the embedded SQL files.
// It is a no-op when the schema is already current (migrate.ErrNoChange).
func runMigrations(dbURL string) error {
	// golang-migrate's pgx/v5 driver registers under the pgx5:// scheme.
	// Rewrite postgres:// / postgresql:// so the DATABASE_URL env var needs
	// no changes between local and production.
	pgx5URL := strings.NewReplacer(
		"postgresql://", "pgx5://",
		"postgres://", "pgx5://",
	).Replace(dbURL)

	d, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("create migration source: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", d, pgx5URL)
	if err != nil {
		return fmt.Errorf("init migrator: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("up: %w", err)
	}
	return nil
}

func main() {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		if err := runMigrations(dbURL); err != nil {
			log.Fatalf("migrations: %v", err)
		}
		log.Println("database schema up to date")
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	if supabaseURL == "" {
		log.Fatalf("SUPABASE_URL not set in environment")
	}

	ctx := context.Background()
	dbPool, err := database.NewPool(ctx)
	if err != nil {
		log.Printf("warning: database connection not initialized (%v)", err)
	} else {
		defer dbPool.Close()
	}

	// Initialize JWKS cache and fetch Supabase public keys
	jwksCache := appMiddleware.NewJWKSCache()
	if err := jwksCache.FetchAndCacheKeys(supabaseURL); err != nil {
		log.Fatalf("failed to fetch Supabase JWKS: %v", err)
	}

	router := chi.NewRouter()
	router.Use(chiMiddleware.RequestID)
	router.Use(chiMiddleware.RealIP)
	router.Use(chiMiddleware.Logger)
	router.Use(chiMiddleware.Recoverer)
	router.Use(appMiddleware.CORS(os.Getenv("FRONTEND_ORIGIN")))

	healthHandler := handler.NewHealthHandler()

	var postHandler *handler.PostHandler
	var reactionHandler *handler.ReactionHandler
	var pageHandler *handler.PageHandler
	var galleryHandler *handler.GalleryHandler
	var calendarHandler *handler.CalendarHandler
	var heroVideoHandler *handler.HeroVideoHandler
	var adminRepo *repository.AdminRepository
	if dbPool != nil {
		adminRepo = repository.NewAdminRepository(dbPool)
		postRepo := repository.NewPostRepository(dbPool)

		// The gallery repo is needed in two places: by GalleryService for uploads
		// and by PostService to hydrate posts with their images on read. We build
		// it once here and share it. The S3 client is also shared - when S3 isn't
		// configured both pointers stay nil and both services degrade gracefully.
		galleryRepo := repository.NewGalleryRepository(dbPool)

		var s3Client *storage.S3Client
		s3Bucket := os.Getenv("S3_BUCKET")
		s3Region := os.Getenv("S3_REGION")
		s3Endpoint := os.Getenv("S3_ENDPOINT")
		r2PublicURL := os.Getenv("R2_PUBLIC_URL")
		if s3Bucket != "" && s3Region != "" {
			c, err := storage.NewS3Client(s3Bucket, s3Region, s3Endpoint, r2PublicURL)
			if err != nil {
				log.Fatalf("failed to init S3 client: %v", err)
			}
			s3Client = c
			gallerySvc := service.NewGalleryService(s3Client, galleryRepo)
			galleryHandler = handler.NewGalleryHandler(gallerySvc)
		}

		// PostService takes a presigner (for non-gallery images) and a public
		// URL builder (for gallery_album images, which live in a public R2
		// prefix). Both are wrapped in real interface variables rather than the
		// concrete pointer - passing a typed nil *S3Client directly would create
		// a non-nil interface holding a nil pointer, defeating the service's
		// nil check. The public URL builder is only wired when R2_PUBLIC_URL is
		// set; otherwise gallery images fall back to presigned URLs.
		var presigner service.URLPresigner
		var publicURLs service.PublicURLBuilder
		if s3Client != nil {
			presigner = s3Client
			if r2PublicURL != "" {
				publicURLs = s3Client
			}
		}
		postSvc := service.NewPostService(postRepo, galleryRepo, presigner, publicURLs)
		postHandler = handler.NewPostHandler(postSvc)

		reactionRepo := repository.NewReactionRepository(dbPool)
		reactionSvc := service.NewReactionService(reactionRepo)
		reactionHandler = handler.NewReactionHandler(reactionSvc)

		pageRepo := repository.NewPageRepository(dbPool)
		pageSvc := service.NewPageService(pageRepo)
		pageHandler = handler.NewPageHandler(pageSvc)

		calendarRepo := repository.NewCalendarRepository(dbPool)
		calendarSvc := service.NewCalendarService(calendarRepo)
		calendarHandler = handler.NewCalendarHandler(calendarSvc)

		// Hero video: requires S3 for upload and storage. Presigner decorates
		// the service to attach short-lived URLs (24-hour TTL) on read, cached for
		// 5 minutes to reduce database load. If S3 isn't configured, the handler
		// stays nil and the routes are skipped.
		if s3Client != nil {
			heroVideoRepo := repository.NewHeroVideoRepository(dbPool)
			heroVideoSvc := service.NewHeroVideoService(s3Client, heroVideoRepo, presigner)
			heroVideoHandler = handler.NewHeroVideoHandler(heroVideoSvc)
		}
	}

	router.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", healthHandler.ServeHTTP)

		// Hero video:
		//   PUBLIC (no auth, intentional): GET /hero-video
		//     The homepage fetches the current hero background video (or null if
		//     none uploaded yet). Anyone can view it.
		//   ADMIN-ONLY: POST /admin/hero-video
		//     Uploading a new hero video replaces the current one. Restricted to admins.
		if heroVideoHandler != nil {
			r.Get("/hero-video", heroVideoHandler.GetVideo)
		}

		// Posts:
		//   PUBLIC (no auth, intentional): GET /posts, GET /posts/{id}
		//     Anonymous visitors must be able to browse the church's events,
		//     announcements, bible studies, playlists, and gallery without an
		//     account. Do NOT move these into the RequireAdmin group below - if
		//     you do, every public page on the site goes blank for non-admins.
		//   ADMIN-ONLY: POST/PATCH/DELETE /posts, GET /auth/me
		if postHandler != nil {
			r.Get("/posts", postHandler.List)
			r.Get("/posts/{id}", postHandler.Get)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Get("/auth/me", handler.Me)
				r.Post("/posts", postHandler.Create)
				r.Patch("/posts/{id}", postHandler.Update)
				r.Delete("/posts/{id}", postHandler.Delete)
				if heroVideoHandler != nil {
					r.Post("/admin/hero-video", heroVideoHandler.UploadVideo)
					r.Patch("/admin/hero-video/visibility", heroVideoHandler.SetVisibility)
				}
			})
		}

		// Reactions: PUBLIC (no auth, intentional).
		// Visitors react with an emoji using a browser-generated fingerprint -
		// no login required. Auth would defeat the feature. Do not protect.
		if reactionHandler != nil {
			r.Get("/reactions/{post_id}", reactionHandler.GetCounts)
			r.Post("/reactions", reactionHandler.Upsert)
			r.Delete("/reactions/{post_id}", reactionHandler.Delete)
		}

		// Pages:
		//   PUBLIC (no auth, intentional): GET /pages/{slug}
		//     Used by /about and /connect for everyone, including signed-out
		//     visitors. Do not protect.
		//   ADMIN-ONLY: PUT /pages/{slug}
		if pageHandler != nil {
			r.Get("/pages/{slug}", pageHandler.Get)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Put("/pages/{slug}", pageHandler.Update)
			})
		}

		// Gallery uploads:
		//   ADMIN-ONLY: POST /posts/{id}/images (uploading to S3 mutates state).
		//   The public reads its images via GET /posts → presigned storage_url,
		//   so there is no public route under this handler.
		if galleryHandler != nil {
			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Post("/posts/{id}/images", galleryHandler.UploadImage)
			})
		}

		// Calendar:
		//   PUBLIC (no auth, intentional): GET /calendar
		//     Anyone can view the church calendar (birthdays, bible studies, etc.).
		//   ADMIN-ONLY: every mutation below.
		if calendarHandler != nil {
			r.With(appMiddleware.OptionalAdmin(adminRepo, jwksCache)).Get("/calendar", calendarHandler.GetMonth)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Post("/calendar/events", calendarHandler.CreateEvent)
				r.Patch("/calendar/events/{id}", calendarHandler.UpdateEvent)
				r.Delete("/calendar/events/{id}", calendarHandler.DeleteEvent)
				r.Put("/calendar/months/{year}/{month}/note", calendarHandler.UpsertMonthNote)
				r.Put("/calendar/months/{year}/{month}/settings", calendarHandler.UpsertMonthSettings)
			})
		}
	})

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("backend listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown error: %v", err)
	}
}
