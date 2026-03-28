package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/thienduchuutran/church-website/backend/internal/handler"
	appMiddleware "github.com/thienduchuutran/church-website/backend/internal/middleware"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/service"
	"github.com/thienduchuutran/church-website/backend/pkg/database"
)

func main() {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
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
	var adminRepo *repository.AdminRepository
	if dbPool != nil {
		adminRepo = repository.NewAdminRepository(dbPool)
		postRepo := repository.NewPostRepository(dbPool)
		postSvc := service.NewPostService(postRepo)
		postHandler = handler.NewPostHandler(postSvc)
	}

	router.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", healthHandler.ServeHTTP)

		if postHandler != nil {
			r.Get("/posts", postHandler.List)
			r.Get("/posts/{id}", postHandler.Get)

			r.Group(func(r chi.Router) {
				r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
				r.Post("/posts", postHandler.Create)
				r.Patch("/posts/{id}", postHandler.Update)
				r.Delete("/posts/{id}", postHandler.Delete)
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
