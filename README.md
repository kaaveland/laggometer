# laggometer

The laggometer tells you how long it takes for a headless chromium to load an
arbitrary URL. It is built with deno and playwright.

I mean to make this run on a few strategically placed locations around the globe
to keep track of a few URLs over time, so I can see what using Norwegian sites
is like for tourists and travelers.

Don't take this project too seriously, I'm using it mainly to get some practice
with typescript/deno and running globally distributed jobs. Feel free to use it
for any purpose.

## Usage

laggometer is currently only available as a docker image:

```shell
docker run ghcr.io/kaaveland/laggometer -h
```

## Development

Build:

```shell
docker build . -t laggometer:local
```

Run:

```shell
# Spits out JSON like this: { "https://github.com": ... } where the value is a HAR
docker run --rm laggometer:local https://github.com
```

Lint:

```shell
deno lint
```

Format:

```shell
deno fmt
```

Check:

```shell
deno check
```

Tests: 🚧 will figure out later if this is necessary
