FROM denoland/deno:latest AS deno_builder

COPY main.ts deno.lock deno.json ./
RUN deno compile -A main.ts

FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app
COPY --chown=pwuser:pwuser --from=deno_builder /main /app/main

ENTRYPOINT ["/app/main"]


