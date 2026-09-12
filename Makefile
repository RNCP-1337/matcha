# Matcha - everything you need to run the project.
# Run `make` on its own to see the full list of commands.

SHELL := /bin/bash
.DEFAULT_GOAL := help
.ONESHELL:

ROOT       := $(CURDIR)
SERVER_DIR := $(ROOT)/server
CLIENT_DIR := $(ROOT)/client
ENV_FILE   := $(ROOT)/.env

# Read the ports and database settings from .env so the messages below are accurate.
# The applications load .env themselves (dotenv for Node, native support for Docker Compose).
ifneq (,$(wildcard $(ENV_FILE)))
include $(ENV_FILE)
endif

PORT       ?= 4000
CLIENT_PORT?= 5173
PGPORT     ?= 5455
PGUSER     ?= matcha
PGPASSWORD ?= matcha
PGDATABASE ?= matcha
PGHOST     ?= localhost
MAILUI_PORT?= 8085

COMPOSE := docker compose
NPM     := npm --silent

BOLD  := \033[1m
DIM   := \033[2m
GREEN := \033[32m
YELL  := \033[33m
RED   := \033[31m
OFF   := \033[0m

define banner
	printf "$(BOLD)==> %s$(OFF)\n" "$(1)"
endef

.PHONY: help
help:
	@printf "\n$(BOLD)Matcha$(OFF) - a dating site. Pick a command:\n\n"
	@printf "  $(BOLD)Getting started$(OFF)\n"
	@printf "    $(GREEN)make setup$(OFF)        Install everything, start the database, migrate and seed.\n"
	@printf "    $(GREEN)make dev$(OFF)          Run the API and the site with hot reload (this is the one you want).\n"
	@printf "    $(GREEN)make stop$(OFF)         Stop the dev servers and the containers.\n"
	@printf "\n  $(BOLD)Database$(OFF)\n"
	@printf "    make db            Start PostgreSQL and the local mailbox in Docker.\n"
	@printf "    make migrate       Create or update the tables.\n"
	@printf "    make seed          Fill the database with 500+ profiles (destroys existing data).\n"
	@printf "    make reset-db      Drop everything, migrate and seed again.\n"
	@printf "    make psql          Open a psql shell on the project database.\n"
	@printf "    make db-stats      Count what is currently in the database.\n"
	@printf "\n  $(BOLD)Running in production mode$(OFF)\n"
	@printf "    make build         Build the client into client/dist.\n"
	@printf "    make start         Build, then serve the whole site from the API on port $(PORT).\n"
	@printf "\n  $(BOLD)Checks$(OFF)\n"
	@printf "    make test          Run the end to end suites against a running server.\n"
	@printf "    make check         Syntax check the server and build the client.\n"
	@printf "    make doctor        Report on your machine, ports, containers and database.\n"
	@printf "    make status        Show what is currently running.\n"
	@printf "\n  $(BOLD)Housekeeping$(OFF)\n"
	@printf "    make env           Create .env from .env.example with fresh secrets.\n"
	@printf "    make secrets       Roll new session secrets in .env.\n"
	@printf "    make install       Install the npm dependencies of both projects.\n"
	@printf "    make logs          Follow the database and mail container logs.\n"
	@printf "    make mail          Print the address of the local mailbox.\n"
	@printf "    make oauth-help    How to switch on GitHub or Google sign in.\n"
	@printf "    make clean         Remove build output, uploads and logs.\n"
	@printf "    make fclean        Also remove node_modules and the database volume.\n"
	@printf "    make re            fclean followed by setup.\n"
	@printf "\n  $(DIM)Site: http://localhost:$(CLIENT_PORT)   API: http://localhost:$(PORT)   Mailbox: http://localhost:$(MAILUI_PORT)$(OFF)\n\n"

# ---------------------------------------------------------------- prerequisites

.PHONY: require-node require-docker
require-node:
	@command -v node >/dev/null 2>&1 || { printf "$(RED)Node.js is not installed.$(OFF) Install Node 18 or newer, then run make setup again.\n"; exit 1; }
	@node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' || { printf "$(RED)Node 18 or newer is required$(OFF) (found $$(node -v)).\n"; exit 1; }

require-docker:
	@command -v docker >/dev/null 2>&1 || { printf "$(RED)Docker is not installed.$(OFF)\nStart your own PostgreSQL on port $(PGPORT) instead, then run: make migrate seed\n"; exit 1; }
	@docker info >/dev/null 2>&1 || { printf "$(RED)Docker is installed but not running.$(OFF) Start Docker Desktop and try again.\n"; exit 1; }

# ---------------------------------------------------------------- environment

$(ENV_FILE):
	@$(call banner,Creating .env)
	@cp $(ROOT)/.env.example $(ENV_FILE)
	@node -e '\
		const fs = require("fs"), crypto = require("crypto"); \
		let text = fs.readFileSync("$(ENV_FILE)", "utf8"); \
		text = text.replace(/^SESSION_SECRET=.*$$/m, "SESSION_SECRET=" + crypto.randomBytes(32).toString("base64url")); \
		text = text.replace(/^TOKEN_PEPPER=.*$$/m, "TOKEN_PEPPER=" + crypto.randomBytes(32).toString("base64url")); \
		fs.writeFileSync("$(ENV_FILE)", text);'
	@printf "    .env created with fresh secrets. It is git-ignored, as the subject requires.\n"

.PHONY: env
env: require-node
	@if [ -f $(ENV_FILE) ]; then \
		printf "$(YELL).env already exists$(OFF), leaving it alone. Delete it first if you want a new one.\n"; \
	else \
		$(MAKE) --no-print-directory $(ENV_FILE); \
	fi

.PHONY: secrets
secrets: require-node $(ENV_FILE)
	@$(call banner,Rolling new secrets)
	@node -e '\
		const fs = require("fs"), crypto = require("crypto"); \
		let text = fs.readFileSync("$(ENV_FILE)", "utf8"); \
		text = text.replace(/^SESSION_SECRET=.*$$/m, "SESSION_SECRET=" + crypto.randomBytes(32).toString("base64url")); \
		text = text.replace(/^TOKEN_PEPPER=.*$$/m, "TOKEN_PEPPER=" + crypto.randomBytes(32).toString("base64url")); \
		fs.writeFileSync("$(ENV_FILE)", text);'
	@printf "    New secrets written. Everyone currently signed in will be signed out.\n"

# ---------------------------------------------------------------- install

$(SERVER_DIR)/node_modules: $(SERVER_DIR)/package.json
	@$(call banner,Installing server dependencies)
	@cd $(SERVER_DIR) && $(NPM) install --no-audit --no-fund
	@touch $(SERVER_DIR)/node_modules

$(CLIENT_DIR)/node_modules: $(CLIENT_DIR)/package.json
	@$(call banner,Installing client dependencies)
	@cd $(CLIENT_DIR) && $(NPM) install --no-audit --no-fund
	@touch $(CLIENT_DIR)/node_modules

.PHONY: install
install: require-node $(SERVER_DIR)/node_modules $(CLIENT_DIR)/node_modules
	@printf "$(GREEN)Dependencies are up to date.$(OFF)\n"

# ---------------------------------------------------------------- database

.PHONY: db
db: require-docker $(ENV_FILE)
	@$(call banner,Starting PostgreSQL and the local mailbox)
	@$(COMPOSE) up -d
	@printf "    waiting for PostgreSQL"
	@for i in $$(seq 1 60); do \
		if $(COMPOSE) exec -T db pg_isready -U "$(PGUSER)" -d "$(PGDATABASE)" >/dev/null 2>&1; then \
			printf "\n$(GREEN)    PostgreSQL is ready on port $(PGPORT).$(OFF)\n"; \
			printf "    Mailbox on http://localhost:$(MAILUI_PORT) catches every email the site sends.\n"; \
			exit 0; \
		fi; \
		printf "."; sleep 1; \
	done; \
	printf "\n$(RED)    PostgreSQL did not become ready. Try: make logs$(OFF)\n"; exit 1

.PHONY: db-down
db-down:
	@$(call banner,Stopping the containers)
	@$(COMPOSE) down

.PHONY: migrate
migrate: install $(ENV_FILE)
	@$(call banner,Applying the schema)
	@cd $(SERVER_DIR) && node src/db/migrate.js

.PHONY: seed
seed: install $(ENV_FILE)
	@$(call banner,Seeding profiles)
	@cd $(SERVER_DIR) && node src/db/seed.js

.PHONY: reset-db
reset-db: install $(ENV_FILE)
	@$(call banner,Dropping and rebuilding the database)
	@cd $(SERVER_DIR) && node src/db/migrate.js --drop && node src/db/seed.js

.PHONY: psql
psql:
	@if $(COMPOSE) ps --services --filter status=running 2>/dev/null | grep -q '^db$$'; then \
		$(COMPOSE) exec db psql -U "$(PGUSER)" -d "$(PGDATABASE)"; \
	else \
		PGPASSWORD="$(PGPASSWORD)" psql -h "$(PGHOST)" -p "$(PGPORT)" -U "$(PGUSER)" -d "$(PGDATABASE)"; \
	fi

.PHONY: db-stats
db-stats: install
	@cd $(SERVER_DIR) && node -e '\
		import("./src/db/pool.js").then(async ({ pool, many }) => { \
			const rows = await many(`SELECT \
				(SELECT count(*) FROM users) AS profiles, \
				(SELECT count(*) FROM users WHERE is_verified) AS confirmed, \
				(SELECT count(*) FROM photos) AS photos, \
				(SELECT count(*) FROM tags) AS tags, \
				(SELECT count(*) FROM likes) AS likes, \
				(SELECT count(*) FROM likes l1 JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id WHERE l1.liker_id < l1.liked_id) AS connections, \
				(SELECT count(*) FROM messages) AS messages, \
				(SELECT count(*) FROM visits) AS visits, \
				(SELECT count(*) FROM notifications) AS notifications`); \
			for (const [key, value] of Object.entries(rows[0])) console.log(String(key).padEnd(16), value); \
			await pool.end(); \
		}).catch((error) => { console.error("Could not reach the database:", error.message); process.exit(1); });'

# ---------------------------------------------------------------- running

.PHONY: setup
setup: require-node $(ENV_FILE) install db migrate seed
	@printf "\n$(GREEN)$(BOLD)Everything is ready.$(OFF)\n"
	@printf "Run $(BOLD)make dev$(OFF) and open http://localhost:$(CLIENT_PORT)\n\n"

.PHONY: dev
dev: install $(ENV_FILE)
	@if ! $(COMPOSE) ps --services --filter status=running 2>/dev/null | grep -q '^db$$'; then \
		$(MAKE) --no-print-directory db; \
	fi
	@$(call banner,Starting the API and the site)
	@printf "    Site      http://localhost:$(CLIENT_PORT)\n"
	@printf "    API       http://localhost:$(PORT)\n"
	@printf "    Mailbox   http://localhost:$(MAILUI_PORT)\n"
	@printf "    $(DIM)Press Ctrl-C to stop both.$(OFF)\n\n"
	@trap 'kill 0' EXIT INT TERM; \
	( cd $(SERVER_DIR) && node --watch src/index.js 2>&1 | sed -u 's/^/[api] /' ) & \
	( cd $(CLIENT_DIR) && npx vite --port $(CLIENT_PORT) 2>&1 | sed -u 's/^/[web] /' ) & \
	wait

.PHONY: build
build: install
	@$(call banner,Building the client)
	@cd $(CLIENT_DIR) && $(NPM) run build

.PHONY: start
start: build $(ENV_FILE)
	@if ! $(COMPOSE) ps --services --filter status=running 2>/dev/null | grep -q '^db$$'; then \
		$(MAKE) --no-print-directory db; \
	fi
	@$(call banner,Serving the site from the API)
	@printf "    Open http://localhost:$(PORT)\n\n"
	@cd $(SERVER_DIR) && NODE_ENV=production PUBLIC_URL=http://localhost:$(PORT) node src/index.js

.PHONY: stop
stop:
	@$(call banner,Stopping everything)
	@pkill -f "node .*src/index\.js" 2>/dev/null && printf "    stopped the API\n" || true
	@pkill -f "vite.*--port $(CLIENT_PORT)" 2>/dev/null && printf "    stopped the site\n" || true
	@$(COMPOSE) down 2>/dev/null && printf "    stopped the containers\n" || true

# ---------------------------------------------------------------- checks

.PHONY: test
test: install $(ENV_FILE)
	@$(call banner,End to end tests)
	@curl -fsS http://localhost:$(PORT)/api/health >/dev/null 2>&1 || { \
		printf "$(RED)The API is not answering on port $(PORT).$(OFF)\nStart it first with: make dev\n"; exit 1; }
	@cd $(SERVER_DIR) && node test/smoke.js
	@printf "\n"
	@$(call banner,OAuth tests)
	@cd $(SERVER_DIR) && node test/oauth.js

.PHONY: check
check: install
	@$(call banner,Checking the server sources)
	@cd $(SERVER_DIR) && find src test -name '*.js' -exec node --check {} \; && printf "$(GREEN)    server sources parse cleanly$(OFF)\n"
	@$(MAKE) --no-print-directory build

.PHONY: status
status:
	@printf "$(BOLD)Processes$(OFF)\n"
	@pgrep -fl "src/index.js" >/dev/null 2>&1 && printf "  $(GREEN)running$(OFF)  API on port $(PORT)\n" || printf "  $(DIM)stopped$(OFF)  API\n"
	@pgrep -fl "vite" >/dev/null 2>&1 && printf "  $(GREEN)running$(OFF)  site on port $(CLIENT_PORT)\n" || printf "  $(DIM)stopped$(OFF)  site\n"
	@printf "\n$(BOLD)Containers$(OFF)\n"
	@$(COMPOSE) ps --format '  {{.Name}}  {{.Status}}' 2>/dev/null || printf "  $(DIM)docker is not available$(OFF)\n"

.PHONY: doctor
doctor:
	@printf "$(BOLD)Tooling$(OFF)\n"
	@printf "  node    %s\n" "$$(node -v 2>/dev/null || echo 'not installed')"
	@printf "  npm     %s\n" "$$(npm -v 2>/dev/null || echo 'not installed')"
	@printf "  docker  %s\n" "$$(docker -v 2>/dev/null | cut -d' ' -f3 | tr -d , || echo 'not installed')"
	@printf "\n$(BOLD)Configuration$(OFF)\n"
	@[ -f $(ENV_FILE) ] && printf "  .env    present\n" || printf "  .env    $(YELL)missing, run make env$(OFF)\n"
	@printf "  api     port $(PORT)\n"
	@printf "  site    port $(CLIENT_PORT)\n"
	@printf "  db      $(PGUSER)@$(PGHOST):$(PGPORT)/$(PGDATABASE)\n"
	@printf "\n$(BOLD)Ports in use$(OFF)\n"
	@for port in $(PORT) $(CLIENT_PORT) $(PGPORT) $(MAILUI_PORT); do \
		if lsof -iTCP:$$port -sTCP:LISTEN -n -P >/dev/null 2>&1; then \
			printf "  %-6s $(YELL)busy$(OFF)\n" "$$port"; \
		else \
			printf "  %-6s free\n" "$$port"; \
		fi; \
	done
	@printf "\n$(BOLD)Database$(OFF)\n"
	@set -o pipefail; $(MAKE) --no-print-directory db-stats 2>/dev/null | grep -v 'Dependencies are up to date' | sed 's/^/  /' || printf "  $(YELL)not reachable, run make db$(OFF)\n"

.PHONY: oauth-help
oauth-help:
	@printf "$(BOLD)Social sign in (bonus)$(OFF)\n\n"
	@printf "  The buttons only appear once a provider is configured in .env.\n\n"
	@printf "  $(BOLD)GitHub$(OFF)\n"
	@printf "    1. https://github.com/settings/developers -> New OAuth App\n"
	@printf "    2. Homepage URL          http://localhost:$(CLIENT_PORT)\n"
	@printf "    3. Authorization callback http://localhost:$(CLIENT_PORT)/api/auth/oauth/github/callback\n"
	@printf "    4. Put the id and secret in GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET\n\n"
	@printf "  $(BOLD)Google$(OFF)\n"
	@printf "    1. https://console.cloud.google.com/apis/credentials -> OAuth client ID (Web)\n"
	@printf "    2. Authorized redirect URI http://localhost:$(CLIENT_PORT)/api/auth/oauth/google/callback\n"
	@printf "    3. Put the id and secret in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET\n\n"
	@printf "  Then restart with $(BOLD)make dev$(OFF). No provider is needed to run the tests:\n"
	@printf "  make test drives the whole round trip against its own throwaway provider.\n"

.PHONY: logs
logs:
	@$(COMPOSE) logs -f --tail=80

.PHONY: mail
mail:
	@printf "Every email the site sends is caught locally: $(BOLD)http://localhost:$(MAILUI_PORT)$(OFF)\n"
	@printf "Confirmation and password reset links are in there.\n"

# ---------------------------------------------------------------- cleaning

.PHONY: clean
clean:
	@$(call banner,Removing build output and uploads)
	@rm -rf $(CLIENT_DIR)/dist $(SERVER_DIR)/tmp
	@find $(SERVER_DIR)/uploads -type f ! -name '.gitkeep' -delete 2>/dev/null || true
	@printf "    done\n"

.PHONY: fclean
fclean: clean
	@$(call banner,Removing dependencies and the database volume)
	@rm -rf $(SERVER_DIR)/node_modules $(CLIENT_DIR)/node_modules
	@$(COMPOSE) down -v 2>/dev/null || true
	@printf "    done. Your .env was left untouched.\n"

.PHONY: re
re: fclean setup
