# Framework-Specific Patterns

This reference provides entry point detection patterns and request flow understanding for supported frameworks.

---

## Express.js

### Entry Point Detection

**Route registration patterns:**
```typescript
// Direct app methods
app.get('/path', handler)
app.post('/path', middleware1, middleware2, handler)

// Router pattern
const router = Router();
router.get('/users', getUsers)
router.post('/users', validateBody, createUser)
app.use('/api', router)
```

**Serena search patterns:**
```
find_symbol: name_path_pattern="router" OR "app"
search_for_pattern: "(app|router)\\.(get|post|put|delete|patch)\\s*\\("
```

### Request Flow

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ App-level middleware        │  ← app.use(cors())
│ (registered order)          │  ← app.use(helmet())
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Router-level middleware     │  ← router.use(authenticate)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Route-specific middleware   │  ← router.post('/users', [here], handler)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Route handler               │  ← Final function in chain
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Error middleware            │  ← app.use((err, req, res, next) => {})
│ (if error thrown)           │
└─────────────────────────────┘
```

### Terminal Points
- `res.send(data)` - Send response body
- `res.json(data)` - Send JSON response
- `res.render(view, data)` - Render template
- `res.redirect(url)` - Redirect
- `res.end()` - End response without body

### Key Symbols to Find
| Symbol | Purpose |
|--------|---------|
| `app.use` | Middleware registration |
| `router.METHOD` | Route handlers |
| `next()` | Middleware chain continuation |
| `next(error)` | Error propagation |

---

## Next.js (App Router)

### Entry Point Detection

**API Routes:**
```
app/
├── api/
│   └── users/
│       ├── route.ts        ← GET/POST handlers
│       └── [id]/
│           └── route.ts    ← Dynamic route
```

**Handler pattern:**
```typescript
// app/api/users/route.ts
export async function GET(request: Request) {
  return Response.json({ users: [] })
}

export async function POST(request: Request) {
  const body = await request.json()
  return Response.json({ user: body }, { status: 201 })
}
```

**Serena search patterns:**
```
find_file: glob_pattern="**/api/**/route.ts"
search_for_pattern: "export\\s+(async\\s+)?function\\s+(GET|POST|PUT|DELETE|PATCH)"
```

### Request Flow

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ middleware.ts               │  ← Root middleware (if exists)
│ (matcher patterns)          │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Route Segment middleware    │  ← Each segment can have middleware
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ API Route Handler           │  ← GET/POST/etc function
│ (app/api/**/route.ts)       │
└─────────────────────────────┘
```

### Terminal Points
- `Response.json(data)` - JSON response
- `NextResponse.json(data)` - Next.js extended response
- `NextResponse.redirect(url)` - Redirect
- `NextResponse.rewrite(url)` - Rewrite (invisible redirect)

### Key Symbols to Find
| Symbol | Purpose |
|--------|---------|
| `export function GET/POST/...` | HTTP method handlers |
| `NextRequest` | Extended request with cookies, geo |
| `NextResponse` | Extended response utilities |
| `middleware` export | Middleware function |

---

## Next.js (Pages Router)

### Entry Point Detection

**API Routes:**
```
pages/
└── api/
    └── users/
        ├── index.ts        ← /api/users
        └── [id].ts         ← /api/users/:id
```

**Handler pattern:**
```typescript
// pages/api/users/index.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    res.status(200).json({ users: [] })
  } else if (req.method === 'POST') {
    res.status(201).json({ user: req.body })
  }
}
```

**Serena search patterns:**
```
find_file: glob_pattern="**/pages/api/**/*.ts"
search_for_pattern: "export\\s+default\\s+(async\\s+)?function"
```

### Request Flow

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ API Route Handler           │  ← Single default export
│ (pages/api/**)              │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Method check (if/switch)    │  ← req.method === 'GET'
└─────────────────────────────┘
```

### Terminal Points
- `res.status(code).json(data)` - JSON response
- `res.send(data)` - Generic response
- `res.redirect(code, url)` - Redirect

---

## Fastify

### Entry Point Detection

**Route registration patterns:**
```typescript
// Shorthand
fastify.get('/users', async (request, reply) => {})
fastify.post('/users', { schema }, async (request, reply) => {})

// Full declaration
fastify.route({
  method: 'POST',
  url: '/users',
  schema: { body: createUserSchema },
  handler: async (request, reply) => {}
})
```

**Serena search patterns:**
```
search_for_pattern: "fastify\\.(get|post|put|delete|route)\\s*\\("
```

### Request Flow (Lifecycle Hooks)

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ 1. onRequest                │  ← First hook, raw request
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 2. preParsing               │  ← Before body parsing
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 3. preValidation            │  ← Before schema validation
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 4. preHandler               │  ← Before handler (auth here)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 5. handler                  │  ← Route handler
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 6. preSerialization         │  ← Before serializing response
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 7. onSend                   │  ← Before sending response
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 8. onResponse               │  ← After response sent (logging)
└─────────────────────────────┘
```

### Terminal Points
- `reply.send(data)` - Send response
- `reply.code(status).send(data)` - With status code
- `return data` - Implicit send (async handlers)

---

## Hono

### Entry Point Detection

**Route registration patterns:**
```typescript
const app = new Hono()

app.get('/users', (c) => c.json({ users: [] }))
app.post('/users', validator('json', schema), (c) => c.json({ user: c.req.valid('json') }))

// Grouped routes
const api = app.basePath('/api')
api.get('/users', handler)
```

**Serena search patterns:**
```
search_for_pattern: "app\\.(get|post|put|delete|all)\\s*\\("
search_for_pattern: "new\\s+Hono\\s*\\("
```

### Request Flow

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ Global middleware           │  ← app.use('*', middleware)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Route middleware            │  ← app.use('/api/*', auth)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Route-specific middleware   │  ← In route chain
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Route handler               │  ← Final handler
└─────────────────────────────┘
```

### Terminal Points
- `c.json(data)` - JSON response
- `c.text(data)` - Plain text response
- `c.html(data)` - HTML response
- `c.redirect(url)` - Redirect

---

## NestJS

### Entry Point Detection

**Controller pattern:**
```typescript
@Controller('users')
export class UsersController {
  @Post()
  @UseGuards(AuthGuard)
  @UsePipes(ValidationPipe)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
}
```

**Serena search patterns:**
```
search_for_pattern: "@Controller\\s*\\("
search_for_pattern: "@(Get|Post|Put|Delete|Patch)\\s*\\("
```

### Request Flow

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ Global middleware           │  ← app.use()
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Guards                      │  ← @UseGuards() - Authorization
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Interceptors (before)       │  ← @UseInterceptors()
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Pipes                       │  ← @UsePipes() - Validation/Transform
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Controller method           │  ← @Get(), @Post(), etc.
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Interceptors (after)        │  ← Transform response
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Exception filters           │  ← If error thrown
└─────────────────────────────┘
```

### Terminal Points
- `return data` - Auto-serialized to JSON
- `throw new HttpException()` - Error response
- `@Res() res` - Manual response control

---

## Generic Node.js (http/https module)

### Entry Point Detection

```typescript
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/users') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ users: [] }))
  }
})
```

**Serena search patterns:**
```
search_for_pattern: "http\\.createServer\\s*\\("
search_for_pattern: "https\\.createServer\\s*\\("
```

### Request Flow

```
HTTP Request
    │
    ▼
┌─────────────────────────────┐
│ Request handler callback    │  ← Single function handles all
│ (manual routing)            │
└─────────────────────────────┘
```

### Terminal Points
- `res.end(data)` - End response
- `res.write(chunk)` + `res.end()` - Streaming
