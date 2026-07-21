---
title: "Xisper"
description: "AI-powered voice input tool, 20+ languages, < 200ms latency"
status: "stable"
version: "1.2.0"
tech: ["Vue", "TypeScript", "OpenAI", "Cloudflare Workers"]
weight: 1
links:
  - name: "Demo"
    url: "https://xisper.app"
  - name: "GitHub"
    url: "https://github.com/user/xisper"
---

## Features

- High-accuracy speech recognition
- Ultra-fast response (< 200ms)
- Supports 20+ languages
- Runs entirely on edge nodes

## Architecture

The frontend uses Vue 3 + TypeScript; the backend runs on Cloudflare Workers and calls the OpenAI Whisper API for speech-to-text.

The whole system has no traditional servers, so latency is extremely low.
