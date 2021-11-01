/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    createKeyborgIfMissing,
    isNavigatingWithKeyboard,
    Keyborg,
    KEYBORG_UPDATE,
    setNavigatingWithKeyboard,
    UpdateEvent
} from 'keyborg';
import { Subscribable } from './Subscribable';
import * as Types from '../Types';

export class KeyboardNavigationState extends Subscribable<boolean>
    implements Types.KeyboardNavigationState {
    private _keyborg?: Keyborg;

    constructor(getWindow: Types.GetWindow) {
        super();
        this._keyborg = createKeyborgIfMissing(getWindow());
        this._keyborg.addEventListener(KEYBORG_UPDATE, this._onChange);
    }

    protected dispose(): void {
        super.dispose();

        if (this._keyborg) {
            this._keyborg.removeEventListener(KEYBORG_UPDATE, this._onChange);

            delete this._keyborg;
        }
    }

    private _onChange = (event: UpdateEvent) => {
        this.setVal(event.detail.isNavigatingWithKeyboard, undefined);
    }

    static dispose(instance: Types.KeyboardNavigationState): void {
        (instance as KeyboardNavigationState).dispose();
    }

    static setVal(instance: Types.KeyboardNavigationState, val: boolean): void {
        setNavigatingWithKeyboard(val);
    }

    isNavigatingWithKeyboard(): boolean {
        return isNavigatingWithKeyboard();
    }
}
