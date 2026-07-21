---
title: "Vue 3 Composition API in Practice"
date: 2026-04-08
tags: ["Vue", "JavaScript", "tutorial"]
---

A hands-on guide to migrating from the Options API to the Composition API.

## Why Migrate

- Better type inference
- More flexible code organization
- Easier logic reuse

## Basic Usage

```javascript
import { ref, computed } from 'vue'

const count = ref(0)
const double = computed(() => count.value * 2)
```

## Composables

Extract reusable logic into `useXxx` functions instead of mixins.
