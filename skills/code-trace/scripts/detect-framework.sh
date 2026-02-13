#!/bin/bash
# detect-framework.sh - Auto-detect project framework for code-trace skill
#
# Usage: ./detect-framework.sh [project_root]
# Output: Framework identifier (express, nextjs-app, nextjs-pages, fastify, nestjs, hono, koa, generic)

set -e

PROJECT_ROOT="${1:-.}"
PKG_JSON="$PROJECT_ROOT/package.json"

# Check if package.json exists
if [[ ! -f "$PKG_JSON" ]]; then
    echo "generic"
    exit 0
fi

# Read package.json content
PKG_CONTENT=$(cat "$PKG_JSON")

# Helper function to check if a package is in dependencies or devDependencies
has_package() {
    local pkg="$1"
    echo "$PKG_CONTENT" | grep -qE "\"$pkg\"\\s*:" && return 0
    return 1
}

# Detect framework (order matters - more specific first)

# NestJS (built on Express/Fastify)
if has_package "@nestjs/core"; then
    echo "nestjs"
    exit 0
fi

# Next.js (check App Router vs Pages Router)
if has_package "next"; then
    if [[ -d "$PROJECT_ROOT/app" ]] || [[ -d "$PROJECT_ROOT/src/app" ]]; then
        echo "nextjs-app"
    else
        echo "nextjs-pages"
    fi
    exit 0
fi

# Remix
if has_package "@remix-run/react" || has_package "@remix-run/node"; then
    echo "remix"
    exit 0
fi

# Hono
if has_package "hono"; then
    echo "hono"
    exit 0
fi

# Fastify
if has_package "fastify"; then
    echo "fastify"
    exit 0
fi

# Koa
if has_package "koa"; then
    echo "koa"
    exit 0
fi

# Express (check last among Node.js frameworks as it's often a dependency of others)
if has_package "express"; then
    echo "express"
    exit 0
fi

# Generic Node.js / unknown framework
echo "generic"
