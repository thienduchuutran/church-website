package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
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
	"github.com/thienduchuutran/church-website/backend/internal/translation"
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

	// Translation engine wiring.
	//
	// enqueueTranslation is the function content services call to fan out a
	// translation job. It is built whenever the DB pool exists, independent
	// of whether API keys are present - jobs always enqueue cleanly; whether
	// they get processed depends on the worker, which only starts when at
	// least one AI key is configured. The closure launches its own goroutine
	// with a fresh background context so the calling HTTP request can return
	// to the client immediately, and a 10s timeout so a stalled DB does not
	// leak goroutines forever.
	//
	// The worker Stop defer is registered after dbPool.Close so it runs
	// first on shutdown: stop accepting new translate work, then tear down
	// the pool.
	var (
		translationWorker  *translation.Worker
		enqueueTranslation translation.EnqueueFn
	)
	if dbPool != nil {
		enqueueTranslation = func(job translation.TranslationJob) {
			go func() {
				bg, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				if err := translation.EnqueueTranslation(bg, dbPool, job); err != nil {
					log.Printf("enqueue translation job (table=%s record=%s): %v", job.TableName, job.RecordID, err)
				}
			}()
		}

		geminiKey := os.Getenv("GEMINI_API_KEY")
		if geminiKey != "" {
			supported := []string{"vi"}
			if raw := os.Getenv("SUPPORTED_LOCALES"); raw != "" {
				supported = strings.Split(raw, ",")
			}
			interval := 5 * time.Second
			if raw := os.Getenv("TRANSLATION_WORKER_INTERVAL"); raw != "" {
				if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
					interval = time.Duration(secs) * time.Second
				}
			}
			translator := translation.NewTranslator(dbPool, geminiKey, supported)
			translationWorker = translation.NewWorker(translator, dbPool, interval)
			translationWorker.Start(ctx)
			defer translationWorker.Stop()
			log.Println("translation worker enabled (gemini)")
		} else {
			log.Println("translation worker disabled (no GEMINI_API_KEY) - jobs will enqueue but not drain")
		}
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
	var tagHandler *handler.TagHandler
	var reactionHandler *handler.ReactionHandler
	var pageHandler *handler.PageHandler
	var galleryHandler *handler.GalleryHandler
	var uploadHandler *handler.UploadHandler
	var calendarHandler *handler.CalendarHandler
	var heroVideoHandler *handler.HeroVideoHandler
	var adminTranslationsHandler *handler.AdminTranslationsHandler
	var assistantHandler *handler.AssistantHandler
	var discordOAuthHandler *handler.DiscordOAuthHandler
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

			// Editor image uploads: store body images under a public prefix and
			// return a permanent URL the editor embeds as <img>. Requires
			// R2_PUBLIC_URL (the service errors on upload if it is unset).
			uploadHandler = handler.NewUploadHandler(service.NewUploadService(s3Client))
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
		if enqueueTranslation != nil {
			postSvc.SetTranslationQueue(enqueueTranslation)
		}
		postHandler = handler.NewPostHandler(postSvc)

		// Tag service and handler. Wired into PostService so gallery albums
		// are hydrated with their tags on read.
		tagRepo := repository.NewTagRepository(dbPool)
		tagSvc := service.NewTagService(tagRepo)
		tagHandler = handler.NewTagHandler(tagSvc)
		postSvc.SetTagRepository(tagRepo)

		// Wire the admin lookup so a post's Discord message is sent under the
		// writing admin's own linked Discord identity, and build the Discord
		// account-linking handler. FRONTEND_ORIGIN is reused as the base the
		// OAuth callback redirects back to.
		postSvc.SetAdminLookup(adminRepo)
		discordOAuthHandler = handler.NewDiscordOAuthHandler(adminRepo, os.Getenv("FRONTEND_ORIGIN"))

		reactionRepo := repository.NewReactionRepository(dbPool)
		reactionSvc := service.NewReactionService(reactionRepo)
		reactionHandler = handler.NewReactionHandler(reactionSvc)

		pageRepo := repository.NewPageRepository(dbPool)
		pageSvc := service.NewPageService(pageRepo)
		if enqueueTranslation != nil {
			pageSvc.SetTranslationQueue(enqueueTranslation)
		}
		pageHandler = handler.NewPageHandler(pageSvc)

		calendarRepo := repository.NewCalendarRepository(dbPool)
		calendarSvc := service.NewCalendarService(calendarRepo)
		if enqueueTranslation != nil {
			calendarSvc.SetTranslationQueue(enqueueTranslation)
		}
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

		// Admin translation review panel. The service shares the same enqueue
		// closure as the content services so the "Re-translate" action can
		// re-queue work for the worker. List + Approve work without an AI key.
		translationRepo := repository.NewTranslationRepository(dbPool)
		translationSvc := service.NewTranslationService(translationRepo)
		if enqueueTranslation != nil {
			translationSvc.SetTranslationQueue(enqueueTranslation)
		}
		adminTranslationsHandler = handler.NewAdminTranslationsHandler(translationSvc)
		// AI Assistant: RAG chatbox for visitors. Requires GROQ_API_KEY to call
		// the LLM. If the key is missing the handler stays nil and the route is
		// skipped — the frontend chatbox will show a graceful error.
		if groqKey := os.Getenv("GROQ_API_KEY"); groqKey != "" {
			assistantRepo := repository.NewAssistantRepository(dbPool)
			groqClient := service.NewGroqClient(groqKey)
			assistantSvc := service.NewAssistantService(assistantRepo, groqClient)
			assistantHandler = handler.NewAssistantHandler(assistantSvc)
			log.Println("AI assistant enabled (GROQ_API_KEY set)")
		} else {
			log.Println("AI assistant disabled (GROQ_API_KEY not set)")
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
		//   ADMIN-ONLY: POST/PATCH/DELETE /posts, PATCH /posts/{id}/archive, GET /auth/me
		if postHandler != nil {
			r.Get("/posts", postHandler.List)
			r.Get("/posts/{id}", postHandler.Get)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Get("/auth/me", handler.Me)
				r.Post("/posts", postHandler.Create)
				r.Patch("/posts/{id}", postHandler.Update)
				r.Patch("/posts/{id}/archive", postHandler.Archive)
				r.Delete("/posts/{id}", postHandler.Delete)
				if heroVideoHandler != nil {
					r.Post("/admin/hero-video", heroVideoHandler.UploadVideo)
					r.Patch("/admin/hero-video/visibility", heroVideoHandler.SetVisibility)
				}
			})
		}

		// Discord account linking (per-admin identity on posts):
		//   ADMIN-ONLY: GET /admin/discord/link   - returns the Discord consent URL
		//   ADMIN-ONLY: GET /admin/discord/status - is the current admin linked?
		//   PUBLIC:     GET /admin/discord/callback - Discord redirects the browser
		//     here after consent. A top-level redirect carries no Bearer token, so
		//     this MUST stay public; trust comes from the HMAC-signed `state`. Do
		//     NOT move it into the RequireAdmin group or linking breaks.
		if discordOAuthHandler != nil {
			r.Get("/admin/discord/callback", discordOAuthHandler.Callback)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Get("/admin/discord/link", discordOAuthHandler.LinkStart)
				r.Get("/admin/discord/status", discordOAuthHandler.Status)
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

		// Tags:
		//   PUBLIC (no auth, intentional): GET /tags
		//     Anyone can list all available tags to filter the gallery.
		//   ADMIN-ONLY: POST/DELETE operations for tag management.
		if tagHandler != nil {
			r.Get("/tags", tagHandler.List)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Post("/tags", tagHandler.Create)
				r.Post("/posts/{id}/tags", tagHandler.Replace)
				r.Delete("/posts/{id}/tags/{tag_id}", tagHandler.Remove)
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

		// Editor image uploads:
		//   ADMIN-ONLY: POST /uploads/image - store a body image in R2 and return
		//   its permanent public URL for the editor to embed. Not tied to a post
		//   (a new post has no id yet) and not recorded in post_images.
		if uploadHandler != nil {
			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Post("/uploads/image", uploadHandler.UploadImage)
			})
		}

		// Admin translation review panel. All routes are admin-only.
		//   GET    /admin/translations                   list with filters (locale, approved, pagination)
		//   PATCH  /admin/translations/{id}              approve as-is or with edits
		//   DELETE /admin/translations/{id}              dismiss: delete without re-enqueueing
		//   POST   /admin/translations/retranslate/{id}  delete current + re-enqueue
		//   POST   /admin/translations/retranslate-all   bulk: delete + re-enqueue every unapproved row
		//   POST   /admin/translations/cleanup-orphans   delete translations whose parent record is gone
		// retranslate-all is registered before retranslate/{id} so chi's router
		// doesn't accidentally route "retranslate-all" into the {id} param.
		if adminTranslationsHandler != nil {
			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Get("/admin/translations", adminTranslationsHandler.List)
				r.Patch("/admin/translations/{id}", adminTranslationsHandler.Approve)
				r.Delete("/admin/translations/{id}", adminTranslationsHandler.Dismiss)
				r.Post("/admin/translations/retranslate-all", adminTranslationsHandler.RetranslateAll)
				r.Post("/admin/translations/retranslate/{id}", adminTranslationsHandler.Retranslate)
				r.Post("/admin/translations/cleanup-orphans", adminTranslationsHandler.CleanupOrphans)
			})
		}

		// Calendar:
		//   PUBLIC (no auth, intentional): GET /calendar, GET /calendar/event-types,
		//     GET /calendar/palette
		//     Anyone can view the church calendar (birthdays, bible studies, etc.).
		//     The event-type vocabulary and the saved color palette are read-only
		//     lists of labels and hex strings - nothing sensitive, and the public
		//     day modal needs the type labels to name an event's category.
		//   ADMIN-ONLY: every mutation below, including growing those two lists.
		if calendarHandler != nil {
			r.With(appMiddleware.OptionalAdmin(adminRepo, jwksCache)).Get("/calendar", calendarHandler.GetMonth)
			r.Get("/calendar/event-types", calendarHandler.ListEventTypes)
			r.Get("/calendar/palette", calendarHandler.ListPaletteColors)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Post("/calendar/events", calendarHandler.CreateEvent)
				r.Patch("/calendar/events/{id}", calendarHandler.UpdateEvent)
				r.Delete("/calendar/events/{id}", calendarHandler.DeleteEvent)
				r.Post("/calendar/event-types", calendarHandler.CreateEventType)
				r.Post("/calendar/palette", calendarHandler.CreatePaletteColor)
				r.Delete("/calendar/palette/{id}", calendarHandler.DeletePaletteColor)
				r.Put("/calendar/months/{year}/{month}/note", calendarHandler.UpsertMonthNote)
				r.Put("/calendar/months/{year}/{month}/settings", calendarHandler.UpsertMonthSettings)
			})
		}

		// AI Assistant chatbox:
		//   PUBLIC (no auth, intentional): POST /assistant/chat
		//     Any visitor can ask questions about church events, service times,
		//     etc. No login required — same philosophy as reactions.
		if assistantHandler != nil {
			r.Post("/assistant/chat", assistantHandler.Chat)
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
