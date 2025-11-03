# Stage 1: Build and cache dependencies
FROM denoland/deno:1.40.2 AS builder

WORKDIR /app

# Copy only the server directory
COPY server/ /app/server/
RUN rm /app/server/deno.lock

# Cache dependencies
RUN deno cache server/main.ts

# Stage 2: Create the final small image
FROM denoland/deno:distroless-1.40.2

WORKDIR /app

# Copy cached dependencies and source code from the builder stage
COPY --from=builder /deno-dir/ /deno-dir/
COPY --from=builder /app/server/ /app/server/

EXPOSE 8080

# Set the command to run the server
CMD ["run", "--allow-net", "--allow-write", "server/main.ts"]
