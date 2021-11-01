/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const KEYBORG_UPDATE = 'keyborg:update' as const;
export const KEYBORG_FOCUSIN = 'keyborg:focusin' as const;

export const KeyTab = 9;
export const KeyEsc = 27;

/**
 * When Esc is pressed and the focused is not moved
 * during _dismissTimeout time, dismiss the keyboard
 * navigation mode.
 */
export const _dismissTimeout = 500; //
