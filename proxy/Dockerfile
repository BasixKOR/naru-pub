# The toolchain is only needed to build. The image used to be rust:1.89 all
# the way through and start with `cargo run --release`, so every running proxy
# carried 2.4GB of compiler and kept a cargo process resident above itself.
FROM rust:1.89-bookworm AS build

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/

RUN cargo build --release

# Same Debian release as the builder, so the binary finds the glibc it was
# linked against. ca-certificates because the S3 client trusts the system roots
# (rustls-native-certs); bash because the compose healthcheck probes the port
# through /dev/tcp.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/target/release/naru-pub-proxy /usr/local/bin/naru-pub-proxy

EXPOSE 5000

CMD ["naru-pub-proxy"]
