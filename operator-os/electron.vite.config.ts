import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts')
      },
      rollupOptions: {
        external: ['electron', 'path', 'os', 'fs', 'child_process', 'events', 'url', 'crypto', 'net', 'http', 'https', 'stream', 'util', 'assert', 'zlib', 'dns', 'tls', 'buffer', 'process', 'string_decoder', 'querystring', 'punycode', 'readline', 'timers', 'tty', 'v8', 'vm', 'worker_threads', 'playwright', 'sql.js', 'ollama']
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          stealth: resolve(__dirname, 'src/preload/stealth.js')
        }
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
