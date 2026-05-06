DB_URL ?= postgresql://postgres:postgres@localhost:5433/church_dev
MIGRATE = migrate -database "$(DB_URL)" -path backend/migrations

.PHONY: migrate-up migrate-down migrate-status seed db-reset

migrate-up:
	$(MIGRATE) up

migrate-down:
	$(MIGRATE) down 1

migrate-status:
	$(MIGRATE) version

seed:
	psql "$(DB_URL)" -f scripts/seed-dev.sql

db-reset:
	docker compose down -v
	docker compose up -d
