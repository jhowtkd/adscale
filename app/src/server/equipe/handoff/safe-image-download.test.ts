import { describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  abortable,
  downloadSafeImage,
  isPublicAddress,
  pinnedImageRequest,
  resolvePublicUrl,
  type ImageResponse,
  type ResolvedAddress,
} from "./safe-image-download";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

const publicLookup = async (): Promise<ResolvedAddress[]> => [{ address: "93.184.216.34", family: 4 }];

async function* singleChunk(bytes: Buffer) {
  yield bytes;
}

function fakeResponse(overrides: Partial<ImageResponse> & { bytes?: Buffer } = {}): ImageResponse {
  const bytes = overrides.bytes ?? Buffer.from("fake-image-bytes");
  return {
    statusCode: overrides.statusCode ?? 200,
    headers: { "content-type": "image/png", "content-length": String(bytes.byteLength), ...overrides.headers },
    body: overrides.body ?? singleChunk(bytes),
    destroy: overrides.destroy ?? vi.fn(),
  };
}

describe("isPublicAddress", () => {
  it("rejects private and reserved IPv4 ranges", () => {
    for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "0.0.0.0", "224.0.0.1", "192.0.2.1"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("accepts a public IPv4 address", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
  });

  it("rejects loopback, link-local and unique-local IPv6, and IPv4-mapped-private IPv6", () => {
    for (const address of ["::1", "fe80::1", "fc00::1", "fd00::1", "::ffff:10.0.0.1", "2001:db8::1"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("accepts a global unicast IPv6 address", () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("resolvePublicUrl", () => {
  it("rejects non-http(s) protocols, credentials in the URL, and non-standard ports", async () => {
    await expect(resolvePublicUrl("ftp://example.com/a.png", publicLookup)).rejects.toThrow();
    await expect(resolvePublicUrl("https://user:pass@example.com/a.png", publicLookup)).rejects.toThrow("unsafe_image_url");
    await expect(resolvePublicUrl("https://example.com:8443/a.png", publicLookup)).rejects.toThrow("unsafe_image_url");
  });

  it("rejects internal-looking hostnames before any DNS lookup", async () => {
    const lookup = vi.fn(publicLookup);
    await expect(resolvePublicUrl("https://myapp.internal/a.png", lookup)).rejects.toThrow("unsafe_image_url");
    await expect(resolvePublicUrl("https://host.local/a.png", lookup)).rejects.toThrow("unsafe_image_url");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resolves the host and rejects when any resolved address is private", async () => {
    await expect(resolvePublicUrl("https://example.com/a.png", async () => [{ address: "169.254.169.254", family: 4 }]))
      .rejects.toThrow("unsafe_image_address");
    await expect(resolvePublicUrl("https://example.com/a.png", async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]))
      .rejects.toThrow("unsafe_image_address");
  });

  it("rejects when the lookup lies about the address family", async () => {
    await expect(resolvePublicUrl("https://example.com/a.png", async () => [{ address: "93.184.216.34", family: 6 }]))
      .rejects.toThrow("unsafe_image_address");
  });

  it("accepts a public host and returns its first resolved address", async () => {
    const result = await resolvePublicUrl("https://example.com/a.png", async () => [{ address: "93.184.216.34", family: 4 }]);
    expect(result.url.hostname).toBe("example.com");
    expect(result.address).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("accepts a literal public IP in the URL without calling the resolver", async () => {
    const lookup = vi.fn(publicLookup);
    const result = await resolvePublicUrl("https://93.184.216.34/a.png", lookup);
    expect(result.address.address).toBe("93.184.216.34");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a literal private IP in the URL", async () => {
    await expect(resolvePublicUrl("https://127.0.0.1/a.png", publicLookup)).rejects.toThrow("unsafe_image_address");
  });
});

describe("pinnedImageRequest", () => {
  let server: Server;
  let port: number;

  async function withServer(handler: Parameters<typeof createServer>[0], run: () => Promise<void>) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    try {
      await run();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("connects to the pinned address, not to whatever the hostname would resolve to", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "image/png");
      res.end(Buffer.from("ok"));
    }, async () => {
      // The hostname does not resolve anywhere real; only the pinned
      // address (127.0.0.1, this server) makes the connection succeed.
      const url = new URL(`http://pinned-host-does-not-resolve.invalid.example:${port}/a.png`);
      const response = await pinnedImageRequest(url, { address: "127.0.0.1", family: 4 }, new AbortController().signal);
      expect(response.statusCode).toBe(200);
      const chunks: Buffer[] = [];
      for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe("ok");
      response.destroy();
    });
  });

  it("preserves the original Host header for the pinned connection", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "image/png");
      res.end(String(req.headers.host));
    }, async () => {
      const url = new URL(`http://original-host.example:${port}/a.png`);
      const response = await pinnedImageRequest(url, { address: "127.0.0.1", family: 4 }, new AbortController().signal);
      const chunks: Buffer[] = [];
      for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe(`original-host.example:${port}`);
      response.destroy();
    });
  });
});

describe("downloadSafeImage", () => {
  it("downloads a supported image within the byte limit", async () => {
    const bytes = Buffer.from("small-png-bytes");
    const request = vi.fn(async () => fakeResponse({ bytes }));
    const result = await downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request });
    expect(result).toEqual({ bytes, contentType: "image/png" });
  });

  it("fixes the IP resolved by lookup and passes that exact address to request, without re-resolving", async () => {
    const resolved: ResolvedAddress = { address: "93.184.216.34", family: 4 };
    const lookup = vi.fn(async () => [resolved]);
    const request = vi.fn(async () => fakeResponse());
    await downloadSafeImage("https://example.com/a.png", { lookup, request });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toEqual(resolved);
  });

  it("follows up to 3 redirects, re-validating the target on every hop", async () => {
    const lookup = vi.fn(publicLookup);
    const request = vi
      .fn<(url: URL, address: ResolvedAddress, signal: AbortSignal) => Promise<ImageResponse>>()
      .mockResolvedValueOnce(fakeResponse({ statusCode: 302, headers: { location: "https://example.com/b.png" } }))
      .mockResolvedValueOnce(fakeResponse({ statusCode: 302, headers: { location: "https://example.com/c.png" } }))
      .mockResolvedValueOnce(fakeResponse({ statusCode: 200 }));
    const result = await downloadSafeImage("https://example.com/a.png", { lookup, request });
    expect(result.contentType).toBe("image/png");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]![0].toString()).toBe("https://example.com/b.png");
    expect(request.mock.calls[2]![0].toString()).toBe("https://example.com/c.png");
  });

  it("rejects a redirect to a host that resolves to a private address, without following it", async () => {
    const lookup = async (host: string) => (host === "cdn.corp-assets.io" ? [{ address: "10.0.0.5", family: 4 as const }] : [{ address: "93.184.216.34", family: 4 as const }]);
    const request = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: "https://cdn.corp-assets.io/a.png" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup, request })).rejects.toThrow("unsafe_image_address");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops following redirects after the 4th hop", async () => {
    const request = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: "https://example.com/next.png" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_redirect_limit");
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("rejects a redirect status without a location header", async () => {
    const request = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: undefined } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_redirect_limit");
  });

  it("rejects a non-2xx, non-redirect status", async () => {
    const request = vi.fn(async () => fakeResponse({ statusCode: 404 }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_http_error");
  });

  it("rejects an unsupported content-type, including SVG", async () => {
    for (const contentType of ["text/html", "application/octet-stream", "image/svg+xml"]) {
      const request = vi.fn(async () => fakeResponse({ headers: { "content-type": contentType } }));
      await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_type_unsupported");
    }
  });

  it("accepts every raster type in the allowlist", async () => {
    for (const contentType of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]) {
      const request = vi.fn(async () => fakeResponse({ headers: { "content-type": contentType } }));
      const result = await downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request });
      expect(result.contentType).toBe(contentType);
    }
  });

  it("rejects when the advertised content-length exceeds the byte limit", async () => {
    const request = vi.fn(async () => fakeResponse({ headers: { "content-length": String(MAX_IMAGE_BYTES + 1) } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_too_large");
  });

  it("rejects a non-identity content-encoding, which could mask the real size", async () => {
    const request = vi.fn(async () => fakeResponse({ headers: { "content-encoding": "gzip" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_too_large");
  });

  it("rejects a stream that exceeds the byte limit even without an honest content-length", async () => {
    async function* oversized() {
      yield Buffer.alloc(1024, 1);
      yield Buffer.alloc(1024, 1);
    }
    const request = vi.fn(async () => fakeResponse({ headers: { "content-length": undefined }, body: oversized() }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request, maxBytes: 1500 })).rejects.toThrow("image_too_large");
  });

  it("clamps a caller-provided maxBytes to the hard 10 MB ceiling", async () => {
    const request = vi.fn(async () => fakeResponse({ headers: { "content-length": String(MAX_IMAGE_BYTES + 1) } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request, maxBytes: MAX_IMAGE_BYTES * 10 })).rejects.toThrow("image_too_large");
  });

  it("rejects an empty body", async () => {
    async function* empty() {}
    const request = vi.fn(async () => fakeResponse({ body: empty(), headers: { "content-length": "0" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_empty");
  });

  it("aborts on timeout instead of hanging", async () => {
    const request = vi.fn(() => new Promise<ImageResponse>(() => {}));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request, timeoutMs: 20 })).rejects.toThrow();
  });

  it("destroys the response even when a later validation step rejects it", async () => {
    const destroy = vi.fn();
    const request = vi.fn(async () => fakeResponse({ headers: { "content-type": "text/html" }, destroy }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("abortable", () => {
  it("rejects immediately if the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort(new Error("already-gone"));
    expect(() => abortable(new Promise(() => {}), controller.signal)).toThrow("already-gone");
  });

  it("rejects with the abort reason when the signal fires mid-flight", async () => {
    const controller = new AbortController();
    const never = new Promise(() => {});
    const result = abortable(never, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(result).rejects.toThrow("cancelled");
  });

  it("resolves normally when the work finishes before any abort", async () => {
    const controller = new AbortController();
    await expect(abortable(Promise.resolve("done"), controller.signal)).resolves.toBe("done");
  });
});
