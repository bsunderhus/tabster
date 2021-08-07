/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTabsterOnElement } from '../Instance';
import { Subscribable } from './Subscribable';
import * as Types from '../Types';
import { documentContains, getElementUId, getPromise, WeakHTMLElement } from '../Utils';

const _conditionCheckTimeout = 100;

interface ObservedElementInfo {
    element: WeakHTMLElement;
    triggeredName?: string;
}

interface ObservedWaiting {
    timer?: number;
    conditionTimer?: number;
    request?: Types.ObservedElementAsyncRequest<HTMLElement | null>;
    resolve?: (value: HTMLElement | null) => void;
    reject?: () => void;
}

export class ObservedElementAPI
        extends Subscribable<HTMLElement, Types.ObservedElementBasicProps> implements Types.ObservedElementAPI {

    private _win: Types.GetWindow;
    private _tabster: Types.TabsterCore;
    private _initTimer: number | undefined;
    private _waiting: Record<string, ObservedWaiting> = {};
    private _lastRequestFocusId = 0;
    private _observedById: { [uid: string]: ObservedElementInfo } = {};
    private _observedByName: { [name: string]: { [uid: string]: ObservedElementInfo } } = {};
    private _currentRequest: Types.ObservedElementAsyncRequest<HTMLElement | null> | undefined;
    private _currentRequestTimestamp = 0;

    constructor(tabster: Types.TabsterCore) {
        super();
        this._tabster = tabster;
        this._win = (tabster as Types.TabsterInternal).getWindow;
        this._initTimer = this._win().setTimeout(this._init, 0);
    }

    private _init = (): void => {
        this._initTimer = undefined;
        this._tabster.focusedElement.subscribe(this._onFocus);
    }

    protected dispose(): void {
        const win = this._win();

        if (this._initTimer) {
            win.clearTimeout(this._initTimer);
            this._initTimer = undefined;
        }

        this._tabster.focusedElement.unsubscribe(this._onFocus);

        for (let key of Object.keys(this._waiting)) {
            this._rejectWaiting(key);
        }

        this._observedById = {};
        this._observedByName = {};
    }

    private _onFocus = (e: HTMLElement | undefined): void => {
        if (e) {
            const current = this._currentRequest;

            if (current) {
                const delta = Date.now() - this._currentRequestTimestamp;
                const settleTime = 300;

                if (delta >= settleTime) {
                    // Giving some time for the focus to settle before
                    // automatically cancelling the current request on focus change.
                    delete this._currentRequest;
                    current.cancel();
                }
            }
        }
    }

    private _rejectWaiting(key: string, shouldResolve?: boolean): void {
        const w = this._waiting[key];

        if (w) {
            const win = this._win();

            if (w.timer) {
                win.clearTimeout(w.timer);
            }

            if (w.conditionTimer) {
                win.clearTimeout(w.conditionTimer);
            }

            if (!shouldResolve && w.reject) {
                w.reject();
            } else if (shouldResolve && w.resolve) {
                w.resolve(null);
            }

            delete this._waiting[key];
        }
    }

    static dispose(instance: Types.ObservedElementAPI): void {
        (instance as ObservedElementAPI).dispose();
    }

    /**
     * Returns existing element by observed name
     *
     * @param observedName An observed name
     * @param accessibility Optionally, return only if the element is accessible or focusable
     * @returns HTMLElement | null
     */
    getElement(observedName: string, accessibility?: Types.ObservedElementAccesibility): HTMLElement | null {
        const o = this._observedByName[observedName];

        if (o) {
            for (let uid of Object.keys(o)) {
                let el = o[uid].element.get() || null;
                if (el) {
                    if (
                        (accessibility === Types.ObservedElementAccesibilities.Accessible &&
                        !this._tabster.focusable.isAccessible(el)) ||

                        (accessibility === Types.ObservedElementAccesibilities.Focusable &&
                        !this._tabster.focusable.isFocusable(el, true))
                    ) {
                        el = null;
                    }
                } else {
                    delete o[uid];
                    delete this._observedById[uid];
                }

                return el;
            }
        }

        return null;
    }

    /**
     * Waits for the element to appear in the DOM and returns it.
     *
     * @param observedName An observed name
     * @param timeout Wait no longer than this timeout
     * @param accessibility Optionally, wait for the element to also become accessible or focusable before returning it
     * @returns Promise<HTMLElement | null>
     */
    waitElement(
        observedName: string,
        timeout: number,
        accessibility?: Types.ObservedElementAccesibility
    ): Types.ObservedElementAsyncRequest<HTMLElement | null> {
        const el = this.getElement(observedName, accessibility);

        if (el) {
            return {
                result: getPromise(this._win).resolve(el),
                cancel: () => {/**/}
            };
        }

        let prefix: string;

        if (accessibility === Types.ObservedElementAccesibilities.Accessible) {
            prefix = 'a';
        } else if (accessibility ===  Types.ObservedElementAccesibilities.Focusable) {
            prefix = 'f';
        } else {
            prefix = '_';
        }

        const key = prefix + observedName;
        let w = this._waiting[key];

        if (w && w.request) {
            return w.request;
        }

        w = this._waiting[key] = {
            timer: this._win().setTimeout(() => {
                if (w.conditionTimer) {
                    this._win().clearTimeout(w.conditionTimer);
                }

                delete this._waiting[key];

                if (w.resolve) {
                    w.resolve(null);
                }
            }, timeout)
        };

        const promise = new (getPromise(this._win))<HTMLElement | null>((resolve, reject) => {
            w.resolve = resolve;
            w.reject = reject;
        });

        w.request = {
            result: promise,
            cancel: () => {
                this._rejectWaiting(key, true);
            }
        };

        return w.request;
    }

    requestFocus(observedName: string, timeout: number): Types.ObservedElementAsyncRequest<boolean> {
        let requestId = ++this._lastRequestFocusId;
        const currentRequestFocus = this._currentRequest;
        const request = this.waitElement(
            observedName,
            timeout,
            Types.ObservedElementAccesibilities.Focusable
        );

        if (currentRequestFocus) {
            currentRequestFocus.cancel();
        }

        this._currentRequest = request;
        this._currentRequestTimestamp = Date.now();

        request.result.finally(() => {
            if (this._currentRequest === request) {
                delete this._currentRequest;
            }
        });

        return {
            result: request.result.then(
                element => ((this._lastRequestFocusId === requestId) && element)
                    ? this._tabster.focusedElement.focus(element, true)
                    : false
            ),
            cancel: () => {
                request.cancel();
            }
        };
    }

    onObservedElementUpdate = (element: HTMLElement): void => {
        const tabsterOnElement = getTabsterOnElement(this._tabster, element);
        const observed = tabsterOnElement?.observed;
        const uid = getElementUId(this._win, element);
        const isInDocument = documentContains(element.ownerDocument, element);
        let info: ObservedElementInfo | undefined = this._observedById[uid];

        if (observed && isInDocument) {
            if (!info) {
                info = this._observedById[uid] = {
                    element: new WeakHTMLElement(this._win, element)
                };
            }

            if (observed.name && (observed.name !== info.triggeredName)) {
                if (info.triggeredName) {
                    const obn = this._observedByName[info.triggeredName];

                    if (obn && obn[uid]) {
                        if (Object.keys(obn).length > 1) {
                            delete obn[uid];
                        } else {
                            delete this._observedByName[info.triggeredName];
                        }
                    }
                }

                info.triggeredName = observed.name;

                let obn = this._observedByName[info.triggeredName];

                if (!obn) {
                    obn = this._observedByName[info.triggeredName] = {};
                }

                obn[uid] = info;

                this._trigger(element, {
                    name: observed.name,
                    details: observed.details
                });
            }
        } else if (info) {
            if (info.triggeredName) {
                const obn = this._observedByName[info.triggeredName];

                if (obn && obn[uid]) {
                    if (Object.keys(obn).length > 1) {
                        delete obn[uid];
                    } else {
                        delete this._observedByName[info.triggeredName];
                    }
                }
            }

            delete this._observedById[uid];
        }
    }

    private _trigger(val: HTMLElement, details: Types.ObservedElementBasicProps): void {
        this.trigger(val, details);

        const name = details.name;

        if (name) {
            const waitingElementKey = '_' + name;
            const waitingAccessibleElementKey = 'a' + name;
            const waitingFocusableElementKey = 'f' + name;
            const waitingElement = this._waiting[waitingElementKey];
            const waitingAccessibleElement = this._waiting[waitingAccessibleElementKey];
            const waitingFocusableElement = this._waiting[waitingFocusableElementKey];
            const win = this._win();

            const resolve = (key: string, waiting: ObservedWaiting) => {
                if (waiting.timer) {
                    win.clearTimeout(waiting.timer);
                }

                delete this._waiting[key];

                if (waiting.resolve) {
                    waiting.resolve(val);
                }
            };

            if (waitingElement) {
                resolve(waitingElementKey, waitingElement);
            }

            if (waitingAccessibleElement && !waitingAccessibleElement.conditionTimer) {
                const resolveAccessible = () => {
                    if (documentContains(val.ownerDocument, val) && this._tabster.focusable.isAccessible(val)) {
                        resolve(waitingAccessibleElementKey, waitingAccessibleElement);
                    } else {
                        waitingAccessibleElement.conditionTimer = win.setTimeout(resolveAccessible, _conditionCheckTimeout);
                    }
                };

                resolveAccessible();
            }

            if (waitingFocusableElement && !waitingFocusableElement.conditionTimer) {
                const resolveFocusable = () => {
                    if (documentContains(val.ownerDocument, val) && this._tabster.focusable.isFocusable(val, true)) {
                        resolve(waitingFocusableElementKey, waitingFocusableElement);
                    } else {
                        waitingFocusableElement.conditionTimer = win.setTimeout(resolveFocusable, _conditionCheckTimeout);
                    }
                };

                resolveFocusable();
            }
        }
    }
}
