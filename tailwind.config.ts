// FILE: tailwind.config.ts (ensure content covers your files)
import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
