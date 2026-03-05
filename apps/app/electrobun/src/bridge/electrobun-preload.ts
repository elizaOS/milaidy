/**
 * Electrobun Preload Script
 *
 * This is the entry point injected into the webview context.
 * It imports and initializes the Electrobun bridge which provides
 * backward compatibility with window.electron.
 *
 * In Electrobun, preload scripts are specified in the BrowserWindow
 * config and run before any page content loads.
 */

import "./electrobun-bridge";
