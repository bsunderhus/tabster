/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WindowWithKeyborgFocusEvent } from './FocusEvent';
import { Keyborg} from './Keyborg';

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

export interface KeyborgContext {
    windowRef?: WindowWithKeyborg & WindowWithKeyborgFocusEvent;
    timeoutID?: number;
    isMouseUsed: boolean;
    isNavigatingWithKeyboard: boolean;
    listeners: Set<WeakRef<EventListener>>;
    eventTarget: EventTarget;
}

export type KeyborgTypestate =
    | {
          value: 'active';
          context: KeyborgContext & {
              windowRef: WindowWithKeyborg & WindowWithKeyborgFocusEvent;
          };
      }
    | {
          value: 'disposed';
          context: KeyborgContext & {
              windowRef: undefined;
          };
      };

export function assertKeyborgActiveState(
    state: KeyborgTypestate,
    functionName: string
): asserts state is Extract<KeyborgTypestate, { value: 'active' }> {
    if (!isKeyborgActiveState(state)) {
        throw new Error(`Error: ${functionName} should not be invoked, keyborg is already disposed`);
    }
}

export function isKeyborgActiveState(
    state: KeyborgTypestate,
): state is Extract<KeyborgTypestate, { value: 'active' }> {
    return state.value === 'active';
}
