/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createKeyborgIfMissing } from 'keyborg';
import * as React from 'react';

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  title: 'Keyborg',
};

const keyborg = createKeyborgIfMissing(window);

export const Keyborg = () => {
    const [message, setMessage] = React.useState('undetermined');
    const onFocus = () => {
        const isKeyboard = keyborg.isNavigatingWithKeyboard();
        if (isKeyboard) {
            setMessage('keyboard');
        } else {
            setMessage('mouse');
        }
    };
    return (
        <>
            <div>Focused with: <strong>{message}</strong></div>
            <button onFocus={onFocus}>Click or use keyboard</button>
            <button onFocus={onFocus}>Click or use keyboard</button>
            <button onFocus={onFocus}>Click or use keyboard</button>
            <button onFocus={onFocus}>Click or use keyboard</button>
        </>
    );
};
