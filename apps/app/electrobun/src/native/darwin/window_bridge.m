/**
 * Milady Window Bridge — native macOS helper for window operations
 * not exposed by Electrobun's BrowserWindow API.
 *
 * Provides:
 * - hideWindow (orderOut:) — true window hiding, not minimize
 * - showWindow (makeKeyAndOrderFront:) — restore hidden window
 * - setOpacity (setAlphaValue:) — window transparency
 *
 * All calls are dispatched to the main thread via dispatch_async since
 * Electrobun runs Bun code in a worker thread, and AppKit must only
 * be called from the main thread.
 *
 * Compile:
 *   clang -dynamiclib -framework Cocoa \
 *     -o libwindowbridge.dylib window_bridge.m
 */

#import <Cocoa/Cocoa.h>

/**
 * Hide the main application window without minimizing to dock.
 * Uses [NSWindow orderOut:] which removes the window from screen
 * but keeps it in memory for fast restoration.
 */
void milady_hide_window(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        // Assumes the first window in [NSApp windows] is the main/key window.
        // This holds for single-window Electrobun apps. For multi-window
        // setups, use [NSApp mainWindow] or [NSApp keyWindow] instead.
        NSWindow *win = [[NSApp windows] firstObject];
        if (win) [win orderOut:nil];
    });
}

/**
 * Show and focus the main application window.
 * Restores a window hidden via milady_hide_window().
 */
void milady_show_window(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *win = [[NSApp windows] firstObject];
        if (win) [win makeKeyAndOrderFront:nil];
    });
}

/**
 * Set the opacity/alpha of the main window.
 * @param alpha 0.0 (fully transparent) to 1.0 (fully opaque)
 */
void milady_set_opacity(double alpha) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *win = [[NSApp windows] firstObject];
        if (win) [win setAlphaValue:(CGFloat)alpha];
    });
}
