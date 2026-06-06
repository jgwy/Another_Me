# syntax=docker/dockerfile:1
FROM python:3.13-slim

# Pinned uv for dependency management.
COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /uvx /bin/

WORKDIR /app

# Install dependencies. Network is available at build time only;
# at runtime this container is attached to an internal-only network.
COPY pyproject.toml ./
RUN uv sync --no-dev

# Application code.
COPY main.py ./

# Run as a non-root user.
RUN useradd --create-home --uid 1000 sandbox \
    && chown -R sandbox:sandbox /app
USER sandbox

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    SANDBOX_TIMEOUT_SECONDS=10

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
