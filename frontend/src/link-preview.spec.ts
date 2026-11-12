import { describe, expect, it } from 'vitest';
import indexHtml from './index.html' with { loader: 'text' };
import image from '../public/og-image.jpg' with { loader: 'binary' };

const head = new DOMParser().parseFromString(indexHtml, 'text/html').head;

function meta(key: string): string | null {
  return (
    head.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute('content') ??
    null
  );
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset < bytes.length) {
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  throw new Error('no JPEG frame header');
}

describe('link preview', () => {
  it('describes the site for link previews', () => {
    expect(meta('og:type')).toBe('website');
    expect(meta('og:site_name')).toBe('Tapwave');
    expect(meta('og:title')).toBeTruthy();
    expect(meta('og:description')).toBeTruthy();
    expect(meta('og:image:alt')).toBeTruthy();
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('points at the bundled image by an absolute URL on the live domain', () => {
    const url = new URL(meta('og:image')!);
    expect(url.origin).toBe('https://tapwave.onrender.com');
    expect(url.pathname).toBe('/og-image.jpg');
    expect(meta('og:image:type')).toBe('image/jpeg');
  });

  it('declares the image size it really has, 1200 × 630', () => {
    const size = jpegSize(image);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(meta('og:image:width')).toBe(String(size.width));
    expect(meta('og:image:height')).toBe(String(size.height));
  });
});
