# CubeDocs

A documentation hosting and management platform. Create projects, write markdown docs, and share them with the world.

> **Work in progress.** This is a prototype. Expect rough edges, missing features, and breaking changes. Not production-ready.

---

## What is this?

CubeDocs is a lightweight platform for hosting and organizing markdown-based documentation, with a built-in password vault. Think a simpler, self-hosted alternative to Notion or Confluence — focused on technical docs, clean URLs, and a no-fuss editing experience.

Built as a monorepo with a React frontend and Cloudflare Workers backend, backed by Cloudflare D1 (SQLite) and R2 storage.

---

## Features

### Auth & Security
- Register and log in with email/password
- Cloudflare Turnstile CAPTCHA on auth forms
- JWT-based sessions
- TOTP (authenticator app) support
- WebAuthn / passkey / security key support
- Password strength indicator (zxcvbn)
- Change password from settings

### Projects
- Create and manage documentation projects with slugs and descriptions
- Role-based member access: Viewer, Editor, Admin, Owner
- Invite and manage members per project
- Publish projects publicly with a clean URL
- Vanity slugs (custom URLs) for published projects
- Enable/disable vault per project
- Changelog mode: off / on / enforced

### Documents
- Markdown editor with split-view live preview
- GitHub-Flavored Markdown (tables, strikethrough, task lists)
- Code blocks with syntax highlighting (Shiki)
- Custom callout blocks (note, warning, tip, error, success, and more)
- Folder-based organization
- Document search
- Toggle heading and last-updated visibility per document
- Full revision history — view and restore previous versions
- Line-by-line blame (who edited each line and when)
- Changelog/commit messages on save
- Publish individual documents publicly

### Files
- Upload files up to 50MB per project
- Organize files into folders
- Rename and move files
- Image preview support
- File type icons (image, PDF, archive, code, etc.)

### Password Vault
- AES-GCM encrypted password storage per project
- Fields: title, username, password, URL, notes
- Encrypted TOTP secret storage with live code generation
- Password generator
- Password strength indicator
- Folder organization
- Password revision history
- Search passwords by title, username, or URL
- Copy fields to clipboard

### Folders
- Hierarchical folders for both documents and passwords
- Create, rename, move, and delete folders
- Recursive content counts (docs, passwords, subfolders)

### Public Docs
- Publish a project site with a clean public URL
- Serve individual published documents publicly
- Folder sidebar and breadcrumb navigation in public view
- Table of contents with heading anchors
- Syntax-highlighted code, callouts, images, tables

### Settings
- **User settings** — display name, password, TOTP, security keys
- **Site settings** — name, description, publishing, vault toggle, changelog mode, vanity slug, member management, danger zone

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, shadcn/ui |
| Backend | Cloudflare Workers, TypeScript |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Monorepo | Turbo + pnpm |

---

## Packages

```
packages/
  frontend/   # React app
  api/        # Core API worker (projects, docs, files, vault)
  auth/       # Auth worker (register, login, JWT, 2FA)
  shared/     # Shared types and utilities
```

---

## Vibecoded with AI

This project is entirely vibecoded. No careful upfront architecture, no design docs — just vibes and iteration. Built with the help of various AI models, primarily **Claude** (by Anthropic).

---

## Disclaimer

This is a prototype. It is not secure enough, not tested enough, and not complete enough for real use. Use it to learn, fork it, break it, whatever.
