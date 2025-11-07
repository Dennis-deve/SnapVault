# SnapVault - Cloud Media Storage App

## Overview

SnapVault is a modern, mobile-first web application designed to help users free up Phone storage by backing up photos and videos to the cloud. The application provides a clean, iOS-inspired interface for uploading, organizing, viewing, and managing media files through albums. Built with a focus on simplicity and user experience, SnapVault follows Apple's Human Interface Guidelines aesthetic with cloud-inspired visual elements.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Tooling:**
- React 18 with TypeScript for type safety and modern component architecture
- Vite as the build tool for fast development and optimized production builds
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching

**UI Component System:**
- shadcn/ui component library built on Radix UI primitives for accessible, customizable components
- Tailwind CSS for utility-first styling with a custom design system
- Custom design tokens following iOS/Apple HIG aesthetic (sky blue primary color #4A90E2, soft white backgrounds, 1rem border radius)
- 8pt grid spacing system for consistent layouts
- Responsive breakpoints: mobile (≤480px), tablet (768px), desktop (≥1200px)

**State Management:**
- React Context for authentication state (AuthContext)
- React Context for theme management (ThemeProvider - light/dark mode)
- TanStack Query for API data caching and synchronization
- Local component state with useState for UI interactions

**Key Pages:**
- Onboarding: Landing page with hero image and call-to-action
- Authentication: Login/Signup with email/password and optional Magic PIN
- Dashboard: Main view showing albums and upload functionality
- AlbumView: Individual album with media grid
- Search: Global media search with filtering
- Settings: User preferences and account management

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript for the REST API
- Session-based authentication using express-session
- Passport.js with LocalStrategy for credential verification

**Authentication:**
- Dual authentication methods: traditional password and optional Magic PIN
- Passwords hashed with bcryptjs (10 salt rounds)
- PIN stored in plain text as a convenience feature
- Session-based auth with HTTP-only cookies (7-day expiration)
- Passport serialization/deserialization for session management

**API Design:**
- RESTful endpoints following resource-based conventions
- Authentication middleware (`requireAuth`) for protected routes
- JSON request/response format
- Error handling with appropriate HTTP status codes

**File Upload Strategy:**
- Multer middleware for multipart form data handling
- Local file storage in `/uploads` directory (extensible to cloud storage)
- File metadata stored in database (filename, path, type, size)

**Data Access Layer:**
- Storage abstraction interface (IStorage) for database operations
- DBStorage implementation using Drizzle ORM
- Separation of concerns between routes and data access

### Database Schema

**ORM & Driver:**
- Drizzle ORM for type-safe database queries
- Neon serverless PostgreSQL driver with WebSocket support
- Schema-first approach with TypeScript type inference

**Tables:**

1. **users**
   - id (UUID, primary key, auto-generated)
   - email (text, unique, required)
   - password (text, required, bcrypt hashed)
   - pin (text, optional, plain text)

2. **albums**
   - id (UUID, primary key, auto-generated)
   - name (text, required)
   - description (text, optional)
   - userId (varchar, foreign key reference)
   - createdAt (timestamp, auto-generated)

3. **media**
   - id (UUID, primary key, auto-generated)
   - filename (text, required)
   - path (text, required)
   - type (text, required - MIME type)
   - size (integer, required - bytes)
   - albumId (varchar, optional foreign key)
   - userId (varchar, required foreign key)
   - createdAt (timestamp, auto-generated)

**Validation:**
- Zod schemas derived from Drizzle table definitions
- Insert schemas for API request validation
- Type inference for compile-time safety

### Design System

**Typography:**
- Headings: Poppins (600/500 weight), sizes from text-xl to text-4xl
- Body: Inter (400/500/600 weight), base 16px
- Loaded from Google Fonts with preconnect optimization

**Color Palette:**
- CSS custom properties for theme support (light/dark modes)
- HSL color format with alpha value support
- Semantic color tokens (primary, secondary, destructive, muted, accent)
- Border and shadow variations for depth

**Component Patterns:**
- Card-based layouts with rounded-2xl (1rem) border radius
- Soft shadows (shadow-md/lg/xl) for elevation
- Hover/active states with subtle background elevation (--elevate-1/2)
- 150ms ease-in-out transitions for smooth interactions

## External Dependencies

### Third-Party Services

**Database:**
- Neon Serverless PostgreSQL (requires DATABASE_URL environment variable)
- Connection pooling via @neondatabase/serverless
- WebSocket support for serverless environments

**Development Tools:**
- Replit-specific plugins for runtime error overlay and development banner
- Vite cartographer for code navigation in Replit environment

### Key NPM Packages

**UI & Styling:**
- @radix-ui/* - Accessible component primitives (dialog, dropdown, toast, etc.)
- tailwindcss - Utility-first CSS framework
- class-variance-authority - Type-safe variant styling
- cmdk - Command palette component

**Data Management:**
- @tanstack/react-query - Server state management
- drizzle-orm - Type-safe ORM
- zod - Schema validation

**Authentication:**
- passport - Authentication middleware
- passport-local - Username/password strategy
- bcryptjs - Password hashing
- express-session - Session management

**Routing:**
- wouter - Lightweight React router

**Forms:**
- react-hook-form - Form state management
- @hookform/resolvers - Form validation resolvers

**Development:**
- vite - Build tool and dev server
- tsx - TypeScript execution
- esbuild - JavaScript bundler for production

### Environment Configuration

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `SESSION_SECRET` - Session encryption key (defaults to development value)
- `NODE_ENV` - Environment mode (development/production)

### Asset Management

- Static assets served from `attached_assets/` directory
- Generated images for branding (logo, hero illustrations)
- Alias configured in Vite: `@assets` pointing to attached_assets directory

## Deployment

### Render.com (Recommended)

SnapVault is optimized for deployment on Render.com with full-stack Node.js support.

**Quick Deploy:**
1. See `RENDER_QUICK_START.md` for 5-minute deployment
2. See `RENDER_DEPLOYMENT.md` for comprehensive guide

**Live URL:** https://snapvault.onrender.com

**Features:**
- ✅ Free SSL certificate
- ✅ Auto-deploy from GitHub
- ✅ Health check endpoint at `/health`
- ✅ CORS configured for production
- ✅ PostgreSQL database integration
- ✅ Cloudinary media storage

### Other Platforms

- **Railway**: See `railway.toml` configuration
- **Local Development**: `npm run dev`

### Environment Variables

Required for production:
```bash
DATABASE_URL=postgresql://user:pass@host/db
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
SESSION_SECRET=random_32_character_string
NODE_ENV=production
PORT=10000
```

See `.env.example` for complete list.
