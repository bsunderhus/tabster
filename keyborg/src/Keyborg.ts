/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    disposeFocusEvent,
    KeyborgFocusInEvent,
    KEYBORG_FOCUSIN,
    setupFocusEvent,
    WindowWithKeyborgFocusEvent
} from './FocusEvent';

export const KEYBORG_UPDATE = 'keyborg:update' as const;

export interface KeyborgEventMap {
    [KEYBORG_UPDATE]: UpdateEvent;
}

export interface KeyborgOptions {
    /**
     * When Esc is pressed and the focused is not moved
     * during _dismissTimeout time, dismiss the keyboard
     * navigation mode.
     */
    dismissTimeout?: number;
}

/**
 * @internal
 */
export interface WindowWithKeyborg extends Window {
    __keyborg?: Keyborg;
}

export type UpdateDetail = { isNavigatingWithKeyboard: boolean };
export type UpdateEvent = CustomEvent<UpdateDetail>;

const KeyTab = 9;
const KeyEsc = 27;

let _windowRef: WindowWithKeyborg | undefined = undefined;

function getKeyborg(): Keyborg {
    if (_windowRef?.__keyborg === undefined) {
        throw new Error(
            `There's no keyborg defined yet, invoke ${createKeyborgIfMissing.name}`
        );
    }
    return _windowRef.__keyborg as Keyborg;
}

export function setNavigatingWithKeyboard(value: boolean): void {
    getKeyborg().setNavigatingWithKeyboard(value);
}

/**
 * @returns Whether the user is navigating with keyboard
 */
export function isNavigatingWithKeyboard(): boolean {
    return getKeyborg().isNavigatingWithKeyboard();
}

/**
 * creates a global keyborg instance if missing
 * otherwise returns global keyborg instance
 * @returns
 */
export function createKeyborgIfMissing(windowRef: Window): Keyborg {
    _windowRef = windowRef as WindowWithKeyborg;
    if (!_windowRef.__keyborg) {
        _windowRef.__keyborg = new Keyborg(_windowRef);
    }
    return _windowRef.__keyborg;
}

export class Keyborg {
    private _windowRef: Window;
    private _timeoutID?: number;
    private _isMouseUsed: boolean = false;
    private _isNavigatingWithKeyboard: boolean = false;
    private _listeners = new Set<EventListener>();
    private _eventTarget = new EventTarget();
    private _options: KeyborgOptions;

    constructor(windowRef: Window, options?: Partial<KeyborgOptions>) {
        this._windowRef = windowRef;
        this._options = {
            dismissTimeout: 500,
            ...options
        };
        this._dangerouslyActivate();
    }

    public isNavigatingWithKeyboard() {
        return this._isNavigatingWithKeyboard;
    }

    public setNavigatingWithKeyboard(value: boolean) {
        if (this._isNavigatingWithKeyboard === value) {
            return;
        }
        this._isNavigatingWithKeyboard = value;
        this._eventTarget.dispatchEvent(
            new CustomEvent<UpdateDetail>(KEYBORG_UPDATE, {
                detail: { isNavigatingWithKeyboard: value }
            })
        );
    }

    public addEventListener<K extends keyof KeyborgEventMap>(
        type: K,
        listener: (ev: KeyborgEventMap[K]) => void
    ): void {
        this._listeners.add(listener);
        this._eventTarget.addEventListener(type, listener);
        if (this._listeners.size === 1) {
            this._dangerouslyActivate();
        }
    }
    public removeEventListener<K extends keyof KeyborgEventMap>(
        type: K,
        listener: (ev: KeyborgEventMap[K]) => void
    ): void {
        this._listeners.delete(listener);
        if (this._listeners.size === 0) {
            this._dangerouslyDispose();
        }
        this._eventTarget.removeEventListener(type, listener);
    }

    private _dangerouslyActivate(): void {
        const { document } = this._windowRef;
        document.addEventListener(KEYBORG_FOCUSIN, this._handleFocusIn, true); // Capture!
        document.addEventListener('mousedown', this._handleMouseDown, true); // Capture!
        addEventListener('keydown', this._handleKeyDown, true); // Capture!
        setupFocusEvent(this._windowRef as WindowWithKeyborgFocusEvent);
        (this._windowRef as WindowWithKeyborg).__keyborg = this;
    }

    private _dangerouslyDispose(): void {
        if (this._timeoutID) {
            this._windowRef.clearTimeout(this._timeoutID);
            this._timeoutID = undefined;
        }

        disposeFocusEvent(this._windowRef);

        const doc = this._windowRef.document;

        doc.removeEventListener(KEYBORG_FOCUSIN, this._handleFocusIn, true); // Capture!
        doc.removeEventListener('mousedown', this._handleMouseDown, true); // Capture!
        this._windowRef.removeEventListener(
            'keydown',
            this._handleKeyDown,
            true
        ); // Capture!
        (this._windowRef as WindowWithKeyborg).__keyborg = undefined;
    }

    private _scheduleDismiss(): void {
        if (this._timeoutID) {
            this._windowRef.clearTimeout(this._timeoutID);
            this._timeoutID = undefined;
        }

        const previousActiveElement = this._windowRef.document.activeElement;

        this._timeoutID = this._windowRef.setTimeout(() => {
            this._timeoutID = undefined;

            const currentActiveElement = this._windowRef.document.activeElement;

            if (
                previousActiveElement &&
                currentActiveElement &&
                previousActiveElement === currentActiveElement
            ) {
                // Esc was pressed, currently focused element hasn't changed.
                // Just dismiss the keyboard navigation mode.
                this.setNavigatingWithKeyboard(false);
            }
        }, this._options.dismissTimeout);
    }
    private _handleMouseDown = (event: MouseEvent): void => {
        if (
            event.buttons === 0 ||
            (event.clientX === 0 &&
                event.clientY === 0 &&
                event.screenX === 0 &&
                event.screenY === 0)
        ) {
            // This is most likely an event triggered by the screen reader to perform
            // an action on an element, do not dismiss the keyboard navigation mode.
            return;
        }

        this._isMouseUsed = true;

        this.setNavigatingWithKeyboard(false);
    }

    private _handleFocusIn = (event: KeyborgFocusInEvent): void => {
        if (this._isMouseUsed) {
            this._isMouseUsed = false;
            return;
        }

        if (this.isNavigatingWithKeyboard()) {
            return;
        }

        const details = event.details;

        if (!details.relatedTarget) {
            return;
        }

        if (
            details.isFocusedProgrammatically ||
            details.isFocusedProgrammatically === undefined
        ) {
            // The element is focused programmatically, or the programmatic focus detection
            // is not working.
            return;
        }

        this.setNavigatingWithKeyboard(true);
    }

    private _handleKeyDown = (event: KeyboardEvent): void => {
        if (!this._isNavigatingWithKeyboard && event.keyCode === KeyTab) {
            this.setNavigatingWithKeyboard(true);
        } else if (this._isNavigatingWithKeyboard && event.keyCode === KeyEsc) {
            this._scheduleDismiss();
        }
    }
}
