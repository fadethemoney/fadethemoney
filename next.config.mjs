/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // isomorphic-dompurify pulls in jsdom; bundling it breaks at runtime on
  // Vercel's serverless functions. Keep it (and jsdom) external so it's
  // required from node_modules at runtime instead — fixes article saving,
  // which sanitizes HTML in the News server actions.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
};
export default nextConfig;
