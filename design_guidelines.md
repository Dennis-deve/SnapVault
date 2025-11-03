# SnapVault Design Guidelines

## Design Approach
**Reference-Based:** iOS/Apple HIG aesthetic with cloud-inspired visual language. Drawing from Apple Photos, iCloud, and modern cloud storage interfaces with emphasis on clean, airy layouts and intuitive interactions.

## Visual Identity

### Color Palette
- **Primary:** #4A90E2 (Sky Blue) - all CTAs, links, active states
- **Secondary:** #F5F7FA (Soft White Background) - page backgrounds
- **Accent Success:** #34D399 (Green) - confirmations, upload complete
- **Accent Danger:** #EF4444 (Red) - delete actions, errors
- **Text Primary:** #4B5563 (Dark Gray) - body text, headers
- **Text Secondary:** #9CA3AF - labels, metadata

### Typography
- **Headings:** Poppins (600 weight for h1/h2, 500 for h3/h4)
  - H1: text-3xl md:text-4xl
  - H2: text-2xl md:text-3xl
  - H3: text-xl md:text-2xl
- **Body:** Inter (400 regular, 500 medium, 600 semibold)
  - Body: text-base (16px)
  - Small: text-sm (14px)
  - Caption: text-xs (12px)

### Spacing System
**8pt Grid Foundation:** Use Tailwind units: 2, 4, 6, 8, 12, 16, 20, 24
- Component padding: p-4 to p-8
- Section spacing: py-12 to py-20
- Card gaps: gap-4 to gap-6
- Button padding: px-6 py-3

### Border & Shadow Treatment
- **Border Radius:** rounded-2xl (1rem) for cards, modals, buttons
- **Shadows:** 
  - Cards: shadow-md (soft, diffuse like iOS)
  - Elevated: shadow-lg for modals
  - Hover: shadow-xl transition
- **Transitions:** 150ms ease-in-out for all interactions

## Layout System

### Responsive Grid Behavior
- **Mobile (≤480px):** Single column, 16px side margins
- **Tablet (768px):** 2-column grid with 24px gaps
- **Desktop (≥1200px):** 4-5 column grid with sidebar navigation

### Album Grid Specifications
- **Mobile:** grid-cols-1 gap-4
- **Tablet:** grid-cols-2 gap-6  
- **Desktop:** grid-cols-3 lg:grid-cols-4 gap-6

### Media Grid in Album View
- **Mobile:** grid-cols-3 gap-2
- **Desktop:** grid-cols-5 gap-3

## Component Library

### Navigation
- **Mobile:** Hamburger menu (top-left), logo center, avatar (top-right)
- **Desktop:** Horizontal nav with logo left, navigation items center, user menu right
- **Height:** h-16 with shadow-sm
- **Background:** White with backdrop blur effect

### Cards (Album Cards)
- Background: White
- Border: None
- Shadow: shadow-md hover:shadow-xl
- Padding: p-6
- Rounded: rounded-2xl
- Thumbnail: aspect-square rounded-xl overflow-hidden
- Meta info: Album name (font-semibold), item count (text-sm text-gray-500)

### Buttons
- **Primary CTA:** bg-[#4A90E2] text-white px-6 py-3 rounded-2xl shadow-md hover:shadow-lg
- **Secondary:** border-2 border-gray-300 px-6 py-3 rounded-2xl hover:border-[#4A90E2]
- **Danger:** bg-[#EF4444] text-white px-6 py-3 rounded-2xl
- **FAB (Floating):** Fixed bottom-right, w-14 h-14, rounded-full, bg-[#4A90E2], shadow-xl, mobile only

### Progress Bars
- Container: h-2 bg-gray-200 rounded-full overflow-hidden
- Fill: bg-[#4A90E2] h-full transition-all duration-300
- Text: text-sm text-gray-600 below bar

### Modals
- Overlay: bg-black/50 backdrop-blur-sm
- Container: bg-white rounded-2xl shadow-2xl max-w-md mx-4 p-8
- Header: text-2xl font-semibold mb-6
- Close: Top-right X icon, text-gray-400 hover:text-gray-600

### Media Viewer (Full-Screen)
- Background: bg-white (light mode) or bg-black (dark mode)
- Image: max-h-screen object-contain
- Video: HTML5 controls, max-w-4xl centered
- Navigation: Left/right arrows, swipe gestures
- Download: Bottom-right floating button, rounded-full bg-[#4A90E2]
- Close: Top-right X, text-white/black contrast

### Empty States
- Icon: Large cloud/folder icon in text-gray-300
- Text: text-xl text-gray-600 mb-4
- Subtext: text-gray-500 text-sm
- CTA: Primary button below

### Search Bar
- Container: w-full max-w-2xl mx-auto
- Input: bg-white border-2 border-gray-200 rounded-2xl px-6 py-3 focus:border-[#4A90E2]
- Icon: Magnifying glass left-aligned text-gray-400

## Page-Specific Guidelines

### Onboarding/Welcome
- Full viewport height with centered content
- Hero illustration (phone + cloud graphic) max-w-md
- Headline: text-4xl font-bold text-center mb-6
- Subtext: text-lg text-gray-600 max-w-lg mx-auto text-center mb-12
- Buttons: Stacked on mobile (w-full), side-by-side on desktop

### Dashboard
- Top card: Upload section with dashed border, hover:bg-gray-50, p-8, rounded-2xl
- Storage bar: Below upload, shows used/total with percentage
- Album grid: Starts below with "Create Album" card as first item (dashed border)

### Album Detail
- Header bar: Sticky top-0, bg-white shadow-sm, h-16
- Back arrow left, album title center, edit/delete icons right
- Grid fills remaining height with overflow-y-auto
- Media items: aspect-square with hover overlay showing filename/date
- Selection mode: Bottom toolbar slides up, bg-white shadow-top

### Settings
- Sectioned layout with dividers
- Each section: py-8 first:pt-0 border-b last:border-0
- Toggle switches: iOS-style rounded-full
- Storage progress: Large version with GB text above bar
- Logout: Red text button at bottom, no background

## Images
- **Hero Image (Onboarding):** Cloud storage illustration showing phone syncing to cloud, centered, max-w-md, maintain airy spacing around it
- **Empty States:** Simple line art icons (cloud, folder, magnifying glass) in gray, not photos
- **Album Thumbnails:** Use first media item as preview, or placeholder cloud icon if empty
- **Media Grid:** Actual user uploaded photos/videos as thumbnails with aspect-ratio-square crop

## Animations
Use sparingly - only for essential feedback:
- Upload progress bar: Width transition 300ms
- Card hover: Transform scale-102 and shadow transition
- Modal: Fade in overlay, scale up modal from 95% to 100%
- FAB: Rotate 45deg when showing close icon
- Page transitions: Simple fade, no elaborate effects

## Accessibility
- All interactive elements min 44px tap target
- Focus rings: ring-2 ring-[#4A90E2] ring-offset-2
- Alt text for all images
- ARIA labels for icon-only buttons
- Semantic HTML throughout