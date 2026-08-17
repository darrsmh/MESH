/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests from ESP32 boards on local network
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Api-Key" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
