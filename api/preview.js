const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function readParam(query, key) {
  const value = query[key];
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function normalizeYouTubeUrl(value) {
  const trimmed = value.trim();
  if (VIDEO_ID_PATTERN.test(trimmed)) {
    return {
      id: trimmed,
      url: `https://www.youtube.com/watch?v=${trimmed}`
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.replace(/^www\./, "");
  let id = "";

  if (host === "youtu.be") {
    id = parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (parsedUrl.pathname === "/watch") {
      id = parsedUrl.searchParams.get("v") || "";
    } else {
      const parts = parsedUrl.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) {
        id = parts[1] || "";
      }
    }
  }

  if (!VIDEO_ID_PATTERN.test(id)) return null;
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`
  };
}

function normalizeHttpsUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsedUrl = new URL(trimmed);
    return parsedUrl.protocol === "https:" ? parsedUrl.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function absoluteRequestUrl(request) {
  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers.host || "";
  return `${protocol}://${host}${request.url || ""}`;
}

function sendHtml(response, statusCode, html) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.end(html);
}

function errorPage(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invalid preview link</title>
  </head>
  <body>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`;
}

module.exports = function handler(request, response) {
  const query = request.query || Object.fromEntries(
    new URL(request.url || "/", "https://example.com").searchParams.entries()
  );
  const destination = normalizeYouTubeUrl(readParam(query, "u"));
  const imageUrl = normalizeHttpsUrl(readParam(query, "image"));

  if (!destination) {
    sendHtml(response, 400, errorPage("Missing or invalid YouTube destination."));
    return;
  }

  if (!imageUrl) {
    sendHtml(response, 400, errorPage("Missing or invalid HTTPS thumbnail image URL."));
    return;
  }

  const title = readParam(query, "title").trim().slice(0, 140) || "Video preview";
  const pageUrl = absoluteRequestUrl(request);
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml("Watch on YouTube");
  const escapedDestination = escapeHtml(destination.url);
  const escapedImage = escapeHtml(imageUrl);
  const escapedPageUrl = escapeHtml(pageUrl);

  sendHtml(response, 200, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapedPageUrl}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:image:secure_url" content="${escapedImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImage}" />
    <link rel="canonical" href="${escapedDestination}" />
    <script>
      window.addEventListener("load", () => {
        window.location.replace(${JSON.stringify(destination.url)});
      });
    <\/script>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        font-family: system-ui, sans-serif;
        color: #17181c;
        background: #f6f7fb;
      }

      a {
        width: min(92vw, 560px);
        color: inherit;
        text-decoration: none;
      }

      img {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border-radius: 8px;
      }

      span {
        display: block;
        margin-top: 12px;
        font-size: 1.1rem;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <a href="${escapedDestination}">
      <img src="${escapedImage}" alt="" />
      <span>${escapedTitle}</span>
    </a>
  </body>
</html>`);
};
