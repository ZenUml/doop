# Diagramly Desktop

Diagramly Desktop is a local diagram editor with support for connecting AI agents through MCP. It includes a sandboxed macOS build, a local document library, and an import path for exported ZenUML diagrams.

The macOS App Store build reuses the existing ZenUML app identity. The current candidate is not a released or signed App Store build.

## Development

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

Run checks with `bun run typecheck`, `bun run lint`, and `bun run test`. See [desktop/README.md](desktop/README.md) for desktop tooling and [the launch tracker](https://github.com/ZenUml/doop/issues/26) for remaining release work.

The [upstream project reference](docs/upstream-doop-reference.md) is retained as historical context. It describes the upstream web product, not the current Diagramly Desktop experience; its relative links may refer to the original repository layout.
