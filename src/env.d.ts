/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    user: import('./server/auth.ts').User | null;
  }
}
