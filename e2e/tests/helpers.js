import { expect } from '@playwright/test';

export const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

/** Waits until the page's main content (not a loading skeleton or spinner) is shown. */
export async function waitForContent(page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"], [role="status"]:has-text("Loading")')).toHaveCount(
    0,
  );
}

/** Layout checks shared by every responsive test. */
export async function expectSoundLayout(page) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth > width) {
      const widest = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > width + 1)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
        .slice(0, 3);
      issues.push(
        `horizontal scroll: content is ${document.documentElement.scrollWidth}px wide (${widest.join(', ')})`,
      );
    }
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
      const style = getComputedStyle(el);
      if (
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        el.closest('.visually-hidden, [hidden], dialog:not([open])')
      )
        continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (el.matches('.visually-hidden, .skip-link') || style.opacity === '0') continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.name || el.tagName)
        .trim()
        .slice(0, 40);
      if (box.left < -1 || box.right > width + 1)
        issues.push(`clipped: "${label}" spans ${Math.round(box.left)}–${Math.round(box.right)}px`);
      // WCAG 2.2 target size (minimum): 24×24 CSS px. Stretched links (card titles whose
      // ::after covers the whole card) are measured by the card, so they're exempt.
      const stretched = getComputedStyle(el, '::after').position === 'absolute';
      if (!stretched && !el.matches('a:not([class])') && (box.height < 24 || box.width < 24)) {
        issues.push(
          `small target: "${label}" is ${Math.round(box.width)}×${Math.round(box.height)}px`,
        );
      }
    }
    return issues;
  });
  expect(problems, `${page.url()}\n${problems.join('\n')}`).toEqual([]);
}
