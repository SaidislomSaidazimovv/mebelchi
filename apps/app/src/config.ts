// App feature flags — one place to hold/enable optional features.
//
// ============================================================================
//  AI RENDER (kie.ai photoreal preview) — HELD FOR v1.
//  To bring it back in v2, set AI_RENDER = true. That single flip restores:
//    • the Preview step in the journey flow + the "Предпросмотр" menu item
//    • the kie.ai key read in model/render.ts
//  Then also (external, one-time):
//    1. Add VITE_KIE_API_KEY back to .env.local AND the Netlify build env.
//       (Better: proxy it via a Supabase Edge Function so the key never ships
//        in the client bundle — see the store-readiness notes.)
//    2. Re-add the kie.ai processor paragraph to public/privacy.html.
//  Nothing else needs touching — everything below is driven by this flag.
// ============================================================================
export const AI_RENDER = false;
