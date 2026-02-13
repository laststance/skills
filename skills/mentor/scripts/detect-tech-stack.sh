#!/bin/bash

# detect-tech-stack.sh
# Detects the tech stack of a project based on package.json and other indicators
#
# Usage: ./detect-tech-stack.sh /path/to/project
# Output: One of: nextjs-app | nextjs-pages | react | react-native | electron | express | fastify | hono | nestjs | python-fastapi | python-django | generic

PROJECT_PATH="${1:-.}"

# Check if path exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo "generic"
    exit 0
fi

# Check for package.json (Node.js projects)
if [ -f "$PROJECT_PATH/package.json" ]; then
    PACKAGE_JSON=$(cat "$PROJECT_PATH/package.json")

    # Next.js detection
    if echo "$PACKAGE_JSON" | grep -q '"next"'; then
        # Check for App Router (app directory)
        if [ -d "$PROJECT_PATH/app" ] || [ -d "$PROJECT_PATH/src/app" ]; then
            echo "nextjs-app"
            exit 0
        fi
        # Check for Pages Router (pages directory)
        if [ -d "$PROJECT_PATH/pages" ] || [ -d "$PROJECT_PATH/src/pages" ]; then
            echo "nextjs-pages"
            exit 0
        fi
        # Default to app router for newer projects
        echo "nextjs-app"
        exit 0
    fi

    # React Native detection
    if echo "$PACKAGE_JSON" | grep -q '"react-native"'; then
        if echo "$PACKAGE_JSON" | grep -q '"expo"'; then
            echo "react-native-expo"
            exit 0
        fi
        echo "react-native"
        exit 0
    fi

    # Electron detection
    if echo "$PACKAGE_JSON" | grep -q '"electron"'; then
        echo "electron"
        exit 0
    fi

    # NestJS detection
    if echo "$PACKAGE_JSON" | grep -q '"@nestjs/core"'; then
        echo "nestjs"
        exit 0
    fi

    # Hono detection
    if echo "$PACKAGE_JSON" | grep -q '"hono"'; then
        echo "hono"
        exit 0
    fi

    # Fastify detection
    if echo "$PACKAGE_JSON" | grep -q '"fastify"'; then
        echo "fastify"
        exit 0
    fi

    # Express detection
    if echo "$PACKAGE_JSON" | grep -q '"express"'; then
        echo "express"
        exit 0
    fi

    # Plain React (Vite or CRA)
    if echo "$PACKAGE_JSON" | grep -q '"react"'; then
        if echo "$PACKAGE_JSON" | grep -q '"vite"'; then
            echo "react-vite"
            exit 0
        fi
        echo "react"
        exit 0
    fi

    # Vue detection
    if echo "$PACKAGE_JSON" | grep -q '"vue"'; then
        if echo "$PACKAGE_JSON" | grep -q '"nuxt"'; then
            echo "nuxt"
            exit 0
        fi
        echo "vue"
        exit 0
    fi

    # Svelte detection
    if echo "$PACKAGE_JSON" | grep -q '"svelte"'; then
        if echo "$PACKAGE_JSON" | grep -q '"@sveltejs/kit"'; then
            echo "sveltekit"
            exit 0
        fi
        echo "svelte"
        exit 0
    fi

    # Generic Node.js
    echo "nodejs"
    exit 0
fi

# Python project detection
if [ -f "$PROJECT_PATH/pyproject.toml" ] || [ -f "$PROJECT_PATH/requirements.txt" ]; then
    # Check for FastAPI
    if [ -f "$PROJECT_PATH/requirements.txt" ]; then
        if grep -q "fastapi" "$PROJECT_PATH/requirements.txt"; then
            echo "python-fastapi"
            exit 0
        fi
        if grep -q "django" "$PROJECT_PATH/requirements.txt"; then
            echo "python-django"
            exit 0
        fi
        if grep -q "flask" "$PROJECT_PATH/requirements.txt"; then
            echo "python-flask"
            exit 0
        fi
    fi

    if [ -f "$PROJECT_PATH/pyproject.toml" ]; then
        if grep -q "fastapi" "$PROJECT_PATH/pyproject.toml"; then
            echo "python-fastapi"
            exit 0
        fi
        if grep -q "django" "$PROJECT_PATH/pyproject.toml"; then
            echo "python-django"
            exit 0
        fi
    fi

    echo "python"
    exit 0
fi

# Go project detection
if [ -f "$PROJECT_PATH/go.mod" ]; then
    echo "go"
    exit 0
fi

# Rust project detection
if [ -f "$PROJECT_PATH/Cargo.toml" ]; then
    if grep -q "tauri" "$PROJECT_PATH/Cargo.toml"; then
        echo "tauri"
        exit 0
    fi
    echo "rust"
    exit 0
fi

# Swift/iOS project detection
if [ -f "$PROJECT_PATH/Package.swift" ] || ls "$PROJECT_PATH"/*.xcodeproj 1>/dev/null 2>&1; then
    echo "swift"
    exit 0
fi

# Default to generic
echo "generic"
