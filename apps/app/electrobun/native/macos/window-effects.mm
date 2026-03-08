#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreGraphics/CoreGraphics.h>

static NSString *const kElectrobunVibrancyViewIdentifier =
	@"ElectrobunVibrancyView";
static NSString *const kElectrobunNativeDragViewIdentifier =
	@"ElectrobunNativeDragView";

@interface ElectrobunNativeDragView : NSView
@end

@implementation ElectrobunNativeDragView
- (BOOL)isOpaque {
	return NO;
}

- (void)drawRect:(NSRect)dirtyRect {
	(void)dirtyRect;
}

- (void)mouseDown:(NSEvent *)event {
	NSWindow *window = [self window];
	if (window != nil && event != nil) {
		[window performWindowDragWithEvent:event];
	}
}
@end

static NSVisualEffectView *findVibrancyView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[NSVisualEffectView class]] &&
			[[subview identifier]
				isEqualToString:kElectrobunVibrancyViewIdentifier]) {
			return (NSVisualEffectView *)subview;
		}
	}

	return nil;
}

static ElectrobunNativeDragView *findNativeDragView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[ElectrobunNativeDragView class]] &&
			[[subview identifier]
				isEqualToString:kElectrobunNativeDragViewIdentifier]) {
			return (ElectrobunNativeDragView *)subview;
		}
	}

	return nil;
}

/**
 * Request accessibility permission with a system prompt.
 * Calls AXIsProcessTrustedWithOptions({kAXTrustedCheckOptionPrompt: true}),
 * which registers the app in System Preferences → Accessibility and shows the
 * authorization dialog. Must be called from within the app process.
 * Returns true if already trusted, false if the prompt was shown.
 */
extern "C" bool requestAccessibilityPermission(void) {
	NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
	return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

/**
 * Check accessibility trust without prompting.
 */
extern "C" bool checkAccessibilityPermission(void) {
	return AXIsProcessTrusted();
}

/**
 * Request screen recording permission.
 * Calls CGRequestScreenCaptureAccess() which registers the app in
 * System Preferences → Screen Recording and shows the authorization dialog.
 * Returns true if already granted.
 */
extern "C" bool requestScreenRecordingPermission(void) {
	if (@available(macOS 10.15, *)) {
		return CGRequestScreenCaptureAccess();
	}
	return true;
}

/**
 * Check screen recording permission without prompting.
 */
extern "C" bool checkScreenRecordingPermission(void) {
	if (@available(macOS 10.15, *)) {
		return CGPreflightScreenCaptureAccess();
	}
	return true;
}

/**
 * Check microphone authorization status via AVFoundation (no prompt).
 * Returns: 0=not-determined, 1=denied, 2=granted, 3=restricted
 */
extern "C" int checkMicrophonePermission(void) {
	AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
	switch (status) {
		case AVAuthorizationStatusAuthorized: return 2;
		case AVAuthorizationStatusDenied:     return 1;
		case AVAuthorizationStatusRestricted: return 3;
		default:                              return 0;
	}
}

/**
 * Check camera authorization status via AVFoundation (no prompt).
 * Returns: 0=not-determined, 1=denied, 2=granted, 3=restricted
 */
extern "C" int checkCameraPermission(void) {
	AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
	switch (status) {
		case AVAuthorizationStatusAuthorized: return 2;
		case AVAuthorizationStatusDenied:     return 1;
		case AVAuthorizationStatusRestricted: return 3;
		default:                              return 0;
	}
}

/**
 * Request camera permission via AVFoundation.
 * Calls AVCaptureDevice requestAccessForMediaType which shows the system
 * camera authorization dialog and registers the app.
 */
extern "C" void requestCameraPermission(void) {
	[AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
	                         completionHandler:^(BOOL granted) {
		(void)granted;
	}];
}

/**
 * Request microphone permission via AVFoundation.
 */
extern "C" void requestMicrophonePermission(void) {
	[AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
	                         completionHandler:^(BOOL granted) {
		(void)granted;
	}];
}

extern "C" bool enableWindowVibrancy(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		[window setOpaque:NO];
		[window setBackgroundColor:[NSColor clearColor]];
		[window setTitlebarAppearsTransparent:YES];
		[window setHasShadow:YES];

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		NSVisualEffectView *effectView = findVibrancyView(contentView);

		if (effectView == nil) {
			effectView = [[NSVisualEffectView alloc]
				initWithFrame:[contentView bounds]];
			[effectView setIdentifier:kElectrobunVibrancyViewIdentifier];
			[effectView
				setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
		}

		if (@available(macOS 10.14, *)) {
			[effectView setMaterial:NSVisualEffectMaterialUnderWindowBackground];
		} else {
			[effectView setMaterial:NSVisualEffectMaterialSidebar];
		}
		[effectView setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
		[effectView setState:NSVisualEffectStateActive];

		if ([effectView superview] == nil) {
			NSView *relativeView = [[contentView subviews] firstObject];
			if (relativeView != nil) {
				[contentView addSubview:effectView
							 positioned:NSWindowBelow
							 relativeTo:relativeView];
			} else {
				[contentView addSubview:effectView];
			}
		}

		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool ensureWindowShadow(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		[window setHasShadow:YES];
		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool setWindowTrafficLightsPosition(void *windowPtr, double x,
											   double yFromTop) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		NSButton *closeButton =
			[window standardWindowButton:NSWindowCloseButton];
		NSButton *minimizeButton =
			[window standardWindowButton:NSWindowMiniaturizeButton];
		NSButton *zoomButton = [window standardWindowButton:NSWindowZoomButton];

		if (closeButton == nil || minimizeButton == nil || zoomButton == nil) {
			return;
		}

		NSView *buttonContainer = [closeButton superview];
		if (buttonContainer == nil) {
			return;
		}

		CGFloat spacing = NSMinX(minimizeButton.frame) - NSMinX(closeButton.frame);
		if (spacing <= 0) {
			spacing = closeButton.frame.size.width + 6.0;
		}

		BOOL flipped = [buttonContainer isFlipped];
		CGFloat targetY = yFromTop;
		if (!flipped) {
			targetY = buttonContainer.frame.size.height - yFromTop -
					  closeButton.frame.size.height;
		}
		targetY = MAX(0.0, targetY);

		CGFloat currentX = x;
		NSArray<NSButton *> *buttons = @[ closeButton, minimizeButton, zoomButton ];
		for (NSButton *button in buttons) {
			[button setFrameOrigin:NSMakePoint(currentX, targetY)];
			currentX += spacing;
		}

		[buttonContainer setNeedsLayout:YES];
		[buttonContainer layoutSubtreeIfNeeded];
		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool orderOutWindow(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}
		[window orderOut:nil];
		success = YES;
	});

	return success;
}

extern "C" bool makeKeyAndOrderFrontWindow(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}
		if ([window isMiniaturized]) {
			[window deminiaturize:nil];
		}
		[window makeKeyAndOrderFront:nil];
		success = YES;
	});

	return success;
}

extern "C" bool isAppActive(void) {
	__block BOOL result = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		result = [NSApp isActive];
	});
	return result;
}

extern "C" bool isWindowKey(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL result = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}
		result = [window isKeyWindow];
	});

	return result;
}

extern "C" bool setNativeWindowDragRegion(void *windowPtr, double x,
										  double height) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		CGFloat dragX = MAX(0.0, x);
		CGFloat dragHeight = MAX(0.0, height);
		CGFloat dragWidth = MAX(0.0, contentView.bounds.size.width - dragX);
		if (dragHeight <= 0.0 || dragWidth <= 0.0) {
			return;
		}

		BOOL flipped = [contentView isFlipped];
		CGFloat dragY = flipped ? 0.0 : contentView.bounds.size.height - dragHeight;
		dragY = MAX(0.0, dragY);

		ElectrobunNativeDragView *dragView = findNativeDragView(contentView);
		if (dragView == nil) {
			dragView = [[ElectrobunNativeDragView alloc] initWithFrame:NSZeroRect];
			[dragView setIdentifier:kElectrobunNativeDragViewIdentifier];
		}

		[dragView setFrame:NSMakeRect(dragX, dragY, dragWidth, dragHeight)];
		[dragView setAutoresizingMask:NSViewWidthSizable];

		if ([dragView superview] == nil) {
			[contentView addSubview:dragView
						 positioned:NSWindowAbove
						 relativeTo:nil];
		}

		success = YES;
	});

	return success;
}
