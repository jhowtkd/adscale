# Docker Configuration

## Arquivos criados

- **Dockerfile** - Build multi-stage otimizado
- **docker-compose.yml** - App + PostgreSQL local + Inngest (opcional)
- **.env.docker** - Variáveis de ambiente para o Docker
- **docker/entrypoint.sh** - Script de inicialização (migrações + start)
- **docker/postgres/init.sql** - Criação do schema inicial

## Como usar

### 1. Build e rodar tudo (app + PostgreSQL local)

```bash
docker-compose up --build
```

Isso vai:
1. Subir o PostgreSQL local
2. Criar o schema `adscale_app`
3. Rodar as migrações do Drizzle
4. Iniciar o app na porta 3000

### 2. Com Inngest (background jobs)

```bash
docker-compose --profile dev up --build
```

Inngest estará disponível em: http://localhost:8288

### 3. Comandos úteis

```bash
# Ver logs
docker-compose logs -f app

# Resetar banco (apaga dados)
docker-compose down -v
docker-compose up --build

# Rodar migrações manualmente
docker-compose exec app npx drizzle-kit migrate

# Acessar banco via psql
docker-compose exec postgres psql -U adscale -d adscale_db

# Parar tudo
docker-compose down
```

## Variáveis de ambiente

O Docker usa o arquivo `.env.docker` (e não `.env.local`).

**PostgreSQL local:**
- Host: `postgres` (dentro do Docker)
- Porta: `5432`
- Database: `adscale_db`
- User: `adscale`
- Password: `adscale123`

## Diferenças do ambiente local

| | Local (sem Docker) | Docker |
|---|---|---|
| Banco | Neon (cloud) | PostgreSQL local |
| Inngest | Rodando separadamente | No mesmo compose (profile dev) |
| Variáveis | `.env.local` | `.env.docker` |
| Persistência | Neon gerencia | Volume Docker `postgres_data` |

## Notas importantes

- O banco PostgreSQL local é reiniciado do zero se você rodar `docker-compose down -v`
- Para produção, continue usando o Neon (configure `DATABASE_URL` no `.env.docker`)
- As migrações rodam automaticamente na inicialização do container
