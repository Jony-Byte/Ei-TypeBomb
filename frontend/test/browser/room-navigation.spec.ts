import { expect, test, type Page } from "@playwright/test";

type Frame = {
    timestamp: number;
    pathname: string;
    scroll: number;
    overlay: string | null;
    origin: number | null;
    clip: string | null;
    header: number | null;
    selectedAboveNeighbor?: boolean;
    layers: { x: number; y: number; contentY: number; height: number; headerHidden: boolean }[];
};

const feed = "http://127.0.0.1:3102/latest";
type TransitionWindow = Window & { roomTransitions: { pathname: string; mode: string }[] };

async function openList(page: Page, waitForViewer = () => new Promise<void>(resolve => setTimeout(resolve, 170))) {
    await page.addInitScript(() => {
        const windowWithTransitions = window as unknown as TransitionWindow;
        windowWithTransitions.roomTransitions = [];
        new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof HTMLElement) || !node.dataset.roomNavigationOverlay) continue;
                    windowWithTransitions.roomTransitions.push({
                        pathname: location.pathname, mode: node.dataset.roomNavigationOverlay,
                    });
                }
            }
        }).observe(document, { childList: true, subtree: true });
    });
    await page.route("**/api/room-list-viewer", async route => {
        if (route.request().isNavigationRequest()) return route.continue();
        await waitForViewer();
        await route.fulfill({ json: {
            currentUser: { id: "fixture", email: null, displayName: null },
            ownedRoomIds: Array.from({ length: 85 }, (_, i) => "room-" + i),
            savedRoomIds: [],
        } });
    });
    await page.goto(feed);
    await expect(page.getByRole("button", { name: "ユーザー", exact: true })).toBeVisible();
}

const card = (page: Page, id: number) => page.locator(`[data-room-list-card="room-${id}"]`);
const overlay = (page: Page) => page.locator("[data-room-navigation-overlay]");

async function sample(page: Page, overlap?: { selected: number; neighbor: number }) {
    await page.evaluate(overlap => {
        const state = window as typeof window & { roomFrames: Frame[]; roomFrameId: number };
        cancelAnimationFrame(state.roomFrameId);
        state.roomFrames = [];
        const frame = (timestamp: number) => {
            const overlay = document.querySelector<HTMLElement>("[data-room-navigation-overlay]");
            const header = document.querySelector("[data-navigation-header]");
            const morphLayer = overlay?.dataset.roomNavigationOverlay === "morph" ? overlay.children[1] : undefined;
            let selectedAboveNeighbor: boolean | undefined;
            if (overlap && morphLayer) {
                const surface = (id: number) => document.querySelector<HTMLElement>(
                    `[data-room-list-card="room-${id}"] .room-card-surface`,
                );
                const selected = surface(overlap.selected);
                const neighbor = surface(overlap.neighbor);
                if (selected && neighbor && Number(getComputedStyle(selected).opacity) > 0) {
                    const moving = morphLayer.getBoundingClientRect();
                    const lower = neighbor.getBoundingClientRect();
                    const left = Math.max(moving.left, lower.left);
                    const top = Math.max(moving.top, lower.top);
                    const right = Math.min(moving.right, lower.right, window.innerWidth);
                    const bottom = Math.min(moving.bottom, lower.bottom, window.innerHeight);
                    if (right - left > 8 && bottom - top > 8) {
                        // The surfaces normally pass pointer events to the card links.
                        // Include both surfaces in hit-testing to read their paint order.
                        selected.style.pointerEvents = neighbor.style.pointerEvents = "auto";
                        const hits = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2);
                        selected.style.removeProperty("pointer-events");
                        neighbor.style.removeProperty("pointer-events");
                        if (hits.includes(selected) && hits.includes(neighbor)) {
                            selectedAboveNeighbor = hits.indexOf(selected) < hits.indexOf(neighbor);
                        }
                    }
                }
            }
            state.roomFrames.push({
                timestamp,
                selectedAboveNeighbor,
                pathname: location.pathname,
                scroll: window.scrollY,
                overlay: overlay?.dataset.roomNavigationOverlay ?? null,
                origin: overlay?.children[1]?.getBoundingClientRect().top ?? null,
                clip: overlay && overlay.dataset.roomNavigationOverlay === "morph"
                    ? getComputedStyle(overlay.children[1].firstElementChild!).clipPath
                    : null,
                header: header?.getBoundingClientRect().top ?? null,
                layers: Array.from(overlay?.querySelectorAll(".room-navigation-slide-layer") ?? []).map(layer => {
                    const rect = layer.getBoundingClientRect();
                    const header = layer.querySelector("[data-navigation-header]");
                    return {
                        x: rect.x, y: rect.y, contentY: layer.firstElementChild!.getBoundingClientRect().y,
                        height: rect.height, headerHidden: !!header && getComputedStyle(header).visibility === "hidden",
                    };
                }),
            });
            state.roomFrameId = requestAnimationFrame(frame);
        };
        state.roomFrameId = requestAnimationFrame(frame);
    }, overlap);
    return () => page.evaluate(() => {
        const state = window as typeof window & { roomFrames: Frame[]; roomFrameId: number };
        cancelAnimationFrame(state.roomFrameId);
        return state.roomFrames;
    });
}

async function finish(page: Page, path: string, mode: "slide" | "morph") {
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await page.waitForFunction(({ path, mode }) =>
        (window as unknown as TransitionWindow).roomTransitions.some(entry => entry.pathname === path && entry.mode === mode),
    { path, mode });
    await expect(overlay(page)).toHaveCount(0);
    await page.evaluate(() => {
        (window as unknown as TransitionWindow).roomTransitions.length = 0;
    });
}

async function expectCentered(page: Page, id: number) {
    const delta = await card(page, id).evaluate(element => {
        const r = element.getBoundingClientRect();
        const screen = window.visualViewport!;
        const expected = Math.max(0, Math.min(
            window.scrollY + r.top + r.height / 2 - screen.height / 2 - screen.offsetTop,
            document.documentElement.scrollHeight - window.innerHeight,
        ));
        return Math.abs(expected - window.scrollY);
    });
    expect(delta).toBeLessThanOrEqual(1);
}

function expectSlide(frames: Frame[], destinationTop: number) {
    const playing = frames.filter(frame => frame.layers.length === 2);
    expect(playing.length).toBeGreaterThan(2);
    const start = playing[0];
    expect(new Set(playing.map(frame => Math.round(frame.scroll)))).toEqual(new Set([Math.round(destinationTop)]));
    for (const frame of playing) {
        expect(frame.header).toBe(start.header);
        frame.layers.forEach((layer, index) => {
            expect(layer.y).toBe(start.layers[index].y);
            expect(layer.contentY).toBe(start.layers[index].contentY);
            expect(layer.height).toBeLessThanOrEqual(900);
            expect(layer.headerHidden).toBe(true);
        });
    }
    expect(playing.some(frame => Math.abs(frame.layers[0].x - start.layers[0].x) > 5)).toBe(true);
}

for (const [name, viewport] of [
    ["desktop", { width: 1360, height: 900 }],
    ["mobile", { width: 390, height: 760 }],
] as const) {
    test.describe(name, () => {
        test.use({ viewport, isMobile: name === "mobile", hasTouch: name === "mobile" });

        test("morphs from a searched list, centers before the reverse morph and survives back/forward", async ({ page }) => {
            await openList(page);
            const search = page.getByRole("textbox", { name: "ルームを検索" });
            await search.fill("Match");
            await expect(card(page, 0)).toHaveCount(0);
            await card(page, 45).scrollIntoViewIfNeeded();
            await card(page, 45).evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
            const from = await card(page, 45).boundingBox();
            const top = await page.evaluate(() => window.scrollY);
            const readEntry = await sample(page);
            await card(page, 45).locator(".room-card-link").click();
            await finish(page, "/room-45", "morph");
            const enter = await readEntry();
            const playing = enter.filter(frame => frame.overlay === "morph");
            expect(playing.length).toBeGreaterThan(2);
            expect(Math.abs(playing[0].origin! - from!.y)).toBeLessThan(35);
            expect(playing.every(frame => frame.scroll === 0)).toBe(true);
            expect(enter.filter(frame => frame.pathname === "/latest").every(frame => frame.scroll === top)).toBe(true);

            const readReturn = await sample(page, { selected: 45, neighbor: name === "mobile" ? 47 : 51 });
            await page.getByRole("link", { name: "戻る", exact: true }).click();
            await finish(page, "/latest", "morph");
            await expect(search).toHaveValue("Match");
            await expectCentered(page, 45);
            const resolvedTop = await page.evaluate(() => window.scrollY);
            const returning = (await readReturn()).filter(frame => frame.overlay === "morph");
            expect(returning.length).toBeGreaterThan(2);
            expect(returning.every(frame => frame.scroll === resolvedTop)).toBe(true);
            expect(returning[0].clip).toMatch(/^inset\(/);
            const overlapping = returning.flatMap(frame => frame.selectedAboveNeighbor ?? []);
            expect(overlapping.length).toBeGreaterThan(0);
            expect(overlapping).not.toContain(false);
            await expect(page.locator("[data-navigation-morphing]")).toHaveCount(0);

            await page.evaluate(() => history.forward());
            await finish(page, "/room-45", "morph");
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
            await page.evaluate(() => history.back());
            await finish(page, "/latest", "morph");
            await expect(search).toHaveValue("Match");
            await expectCentered(page, 45);
        });

        test("slides from the searched list into a slow editor and returns without vertical motion", async ({ page }) => {
            await openList(page);
            const search = page.getByRole("textbox", { name: "ルームを検索" });
            await search.fill("Match");
            await card(page, 47).scrollIntoViewIfNeeded();
            await expect(card(page, 63)).toBeAttached();
            await card(page, 63).evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
            const top = await page.evaluate(() => window.scrollY);
            const readEntry = await sample(page);
            await card(page, 63).getByRole("link", { name: "ルームを編集" }).click();
            await finish(page, "/room-63/edit", "slide");
            const frames = await readEntry();
            const waiting = frames.filter(frame => frame.pathname === "/latest");
            expect(waiting.at(-1)!.timestamp - waiting[0].timestamp).toBeGreaterThan(500);
            expect(waiting.every(frame => frame.scroll === top)).toBe(true);
            expectSlide(frames, 0);

            const readReturn = await sample(page);
            await page.getByRole("button", { name: "Return from editor" }).click();
            await finish(page, "/latest", "slide");
            await expect(search).toHaveValue("Match");
            await expectCentered(page, 63);
            expectSlide(await readReturn(), await page.evaluate(() => window.scrollY));
        });

        test("restores a long detail's exact scroll and clamps a short room's list return", async ({ page }) => {
            await openList(page);
            await card(page, 0).locator(".room-card-link").click();
            await finish(page, "/room-0", "morph");
            await page.getByRole("link", { name: "戻る", exact: true }).click();
            await finish(page, "/latest", "morph");
            await expectCentered(page, 0);
            if (name === "desktop") expect(await page.evaluate(() => window.scrollY)).toBe(0);

            await card(page, 10).locator(".room-card-link").click();
            await finish(page, "/room-10", "morph");
            const edit = page.getByRole("link", { name: "Edit detail" });
            await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
            await expect(edit).toBeInViewport();
            const detailTop = await page.evaluate(() => window.scrollY);
            expect(detailTop).toBeGreaterThan(4000);
            const readEntry = await sample(page);
            await edit.click();
            await finish(page, "/room-10/edit", "slide");
            expectSlide(await readEntry(), 0);
            const readReturn = await sample(page);
            await page.evaluate(() => history.back());
            await finish(page, "/room-10", "slide");
            expect(await page.evaluate(() => window.scrollY)).toBe(detailTop);
            expectSlide(await readReturn(), detailTop);
        });

        test("clamps a return at the actual end of a searched list", async ({ page }) => {
            await openList(page);
            // Remove Shell's generous bottom padding to exercise a layout
            // where a last card physically cannot reach the viewport center.
            await page.addStyleTag({ content: "[data-navigation-shell-width]:has(> [data-room-list]) { padding-bottom: 0; }" });
            await page.getByRole("textbox", { name: "ルームを検索" }).fill("Other");
            await card(page, 46).scrollIntoViewIfNeeded();
            await expect(card(page, 84)).toBeAttached();
            await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
            await card(page, 84).locator(".room-card-link").click();
            await finish(page, "/room-84", "morph");
            const readReturn = await sample(page);
            await page.getByRole("link", { name: "戻る", exact: true }).click();
            await finish(page, "/latest", "morph");
            const scroll = await page.evaluate(() => ({
                top: window.scrollY,
                max: document.documentElement.scrollHeight - window.innerHeight,
            }));
            expect(scroll.top).toBeGreaterThan(0);
            expect(Math.abs(scroll.max - scroll.top)).toBeLessThanOrEqual(1);
            const playing = (await readReturn()).filter(frame => frame.overlay === "morph");
            expect(playing.length).toBeGreaterThan(2);
            expect(playing.every(frame => frame.scroll === scroll.top)).toBe(true);
        });
    });
}

test("supersedes a slow editor navigation and accepts a back action during a slide", async ({ page }) => {
    await openList(page);
    await card(page, 0).getByRole("link", { name: "ルームを編集" }).click();
    await card(page, 1).locator(".room-card-link").click();
    await finish(page, "/room-1", "morph");
    await page.getByRole("link", { name: "Edit detail" }).click();
    await expect(overlay(page)).toHaveAttribute("data-room-navigation-overlay", "slide");
    await page.getByRole("button", { name: "Return from editor" }).evaluate((button: HTMLButtonElement) => button.click());
    await finish(page, "/room-1", "slide");
    await expect(page.locator("[data-room-slide-live]")).toHaveCount(0);
});

test("a slow viewer response cannot move the list after the outgoing cover times out", async ({ page }) => {
    let returning = false;
    const viewer = Promise.withResolvers<void>();
    await openList(page, () => returning ? viewer.promise : Promise.resolve());
    await card(page, 20).getByRole("link", { name: "ルームを編集" }).click();
    await finish(page, "/room-20/edit", "slide");

    returning = true;
    await page.getByRole("button", { name: "Return from editor" }).click();
    await expect(page).toHaveURL(/\/latest$/);
    await expect(page.locator("[data-room-list]")).toHaveAttribute("data-room-list", "pending");
    await expect(overlay(page)).toHaveCount(0);
    await expectCentered(page, 20);
    const top = await page.evaluate(() => window.scrollY);

    viewer.resolve();
    await expect(page.locator("[data-room-list]")).toHaveAttribute("data-room-list", "ready");
    expect(await page.evaluate(() => window.scrollY)).toBe(top);
    await expect(overlay(page)).toHaveCount(0);
});

test("the whole room card opens the detail and its independent copy button remains local", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText: async (text: string) => { document.body.dataset.copiedRoom = text; } },
        });
    });
    await openList(page);
    const room = card(page, 0);
    const copy = room.getByRole("button", { name: "ルームのリンクをコピー" });
    const surface = room.locator(".room-card-surface");
    await copy.hover();
    await page.mouse.down();
    await expect(surface).toHaveCSS("transform", "none");
    await page.mouse.up();
    await expect(page.locator("body")).toHaveAttribute("data-copied-room", /\/room-0$/);
    await expect(page).toHaveURL(/\/latest$/);

    // This point is on the outer article, away from text and action buttons.
    await room.hover({ position: { x: 5, y: 8 } });
    await page.mouse.down();
    await expect.poll(() => surface.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(0.95);
    await page.mouse.up();
    await finish(page, "/room-0", "morph");
});

test("reduced motion keeps the same scrolling policy", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openList(page);
    await card(page, 20).scrollIntoViewIfNeeded();
    await card(page, 20).locator(".room-card-link").click();
    await expect(page).toHaveURL(/\/room-20$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/latest$/);
    await expectCentered(page, 20);
    await expect(overlay(page)).toHaveCount(0);
});
