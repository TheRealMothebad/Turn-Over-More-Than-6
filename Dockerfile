# Stage 1: Build and cache dependencies
FROM denoland/deno:latest AS builder

WORKDIR /app

# Copy only the server directory and shared directory
COPY server/ /app/server/
COPY shared/ /app/shared/

# Cache dependencies using the config file in the server directory
RUN deno cache --config server/deno.json server/main.ts

# Stage 2: Create the final small image
FROM denoland/deno:distroless

WORKDIR /app

# Copy cached dependencies and source code from the builder stage
COPY --from=builder /deno-dir/ /deno-dir/
COPY --from=builder /app/server/ /app/server/
COPY --from=builder /app/shared/ /app/shared/

EXPOSE 8080

# Set the command to run the server
CMD ["run", "--allow-net", "--allow-write", "--config", "server/deno.json", "server/main.ts"]
