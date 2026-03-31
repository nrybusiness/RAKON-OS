# RAKON: Street-Tech Design System (v1.0)

## 1. Core Identity
Estética de alta fidelidad técnica. Mezcla de terminal industrial y brutalismo digital. Sin gradientes, sin bordes redondeados excesivos, máxima legibilidad.

---

## 2. Color Palette (Hex)

### Base Layers
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `background` | `#0A0A0B` | Fondo principal profundo |
| `surface` | `#141415` | Tarjetas, secciones y modales |
| `elevated` | `#1D1D1F` | Inputs y estados de hover |

### Accent & Feedback
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `primary` | `#00FF41` | Terminal Green: Acciones principales |
| `secondary` | `#FF003C` | Cyber Red: Errores y alertas críticas |
| `neutral` | `#888888` | Steel Grey: Texto secundario y bordes |
| `white` | `#F2F2F2` | Ghost White: Texto base y lectura |

---

## 3. Typography
Uso exclusivo de fuentes de ancho fijo para títulos y funcional para lectura.

*   **Header Type (H1-H4):** `JetBrains Mono` (Bold)
    *   *Letter-spacing:* -0.02em
    *   *Case:* Uppercase (Recomendado para títulos de sección)
*   **Body Text:** `Inter` (Regular/Medium)
    *   *Line-height:* 1.6
*   **Data & System:** `Fira Code` (Retina)
    *   Para logs, métricas y código.

---

## 4. UI Rules (The Constraints)

### Borders & Radius
*   **Radius:** `0px` (Default), `2px` (Soft interactables). Prohibido > 4px.
*   **Weight:** `1px` constante.
*   **Style:** Solid.

### Effects
*   **Shadows:** `0px` (Flat UI). Solo se permite `Box-shadow: 0 0 8px #00FF41` para elementos activos o de estado "On".
*   **Grid:** Sistema de 8px para padding y margins.
*   **Overlays:** Scanlines sutiles (Opacity 0.03) o ruido digital en el fondo.

---

## 5. Tailwind Configuration Reference
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        rakon: {
          bg: '#0A0A0B',
          surface: '#141415',
          neon: '#00FF41',
          alert: '#FF003C',
          ghost: '#F2F2F2',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      }
    }
  }
}
