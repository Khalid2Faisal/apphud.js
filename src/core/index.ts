import {deleteCookie, getCookie, setCookie} from '../cookies';
import {config} from './config/config';
import api from "./api";
import u, {canStringify, log, logError, generateSHA256} from "../utils";
import {
    VariableDataAttribute,
    DeepLinkURL,
    EventsKey,
    SelectedProductDuration,
    SelectedProductIndex,
    StartAppVersionKey,
    UserCookieDuration,
    UserIdKey
} from './config/constants';
import {
    Apphud, AttributionData,
    Config,
    CustomerData,
    Error,
    EventData,
    Events,
    ApphudFunc,
    ApphudHash,
    LifecycleEventCallback,
    LifecycleEventName,
    LifecycleEvents,
    PaymentProvider,
    PaymentProviderFormOptions,
    Paywall,
    Placement,
    Product,
    User
} from '../types'

import UserAgent from 'ua-parser-js'
import FormBuilder from "./paymentForms/formBuilder";

/**
 * The main interface for the Apphud SDK. This should be initialized
 * immediately when your app starts. Ensure that only a single instance
 * of ApphudSDK is created at any given time!
 * @public
 */
export default class ApphudSDK implements Apphud {
    public placements: Placement[] = []
    public user: User | undefined = undefined
    public currentPaymentProvider: PaymentProvider | undefined = undefined
    private _currentProduct: Product | undefined = undefined
    private _currentPlacement: Placement | undefined = undefined
    private _currentPaywall: Paywall | undefined = undefined
    private userID: string | undefined = undefined
    private hashedUserID: string | undefined = undefined
    private isReady: boolean = false
    private queue: ApphudFunc[] = []
    private events: LifecycleEvents = {}
    private eventQueue: EventData[] = []
    // private params = new URLSearchParams(window.location.search);

    constructor() {}

    /**
     * Initialized SDK
     * @param options
     */
    public async init(options: Config): Promise<void> {
        log('init', options)

        for (const key in options) {
            if (Object.prototype.hasOwnProperty.call(options, key)) {
                (config as any)[key] = options[key as keyof Config];
            }
        }
        config.headers = api.baseHeaders()

        // push events from queue
        try {
            this.eventQueue = JSON.parse(getCookie(EventsKey) || "[]");

            for (let i = 0; i < this.eventQueue.length; i++) {
                this.trackEvent(this.eventQueue[i])
            }
        } catch (e: any) {
            logError(e as Error);
        }

        u.documentReady(async (): Promise<void> => {
            await this.initializeApp()
        });
    };

    /**
     * Track event
     * @param eventName - event name
     * @param callback - callback function
     */
    public on(eventName: LifecycleEventName, callback: LifecycleEventCallback): void {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }

        this.events[eventName].push(callback);
    }

    private emit(eventName: LifecycleEventName, event: any): void {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callback => callback(event));
        }
    }

    /**
     * Get saved deeplink after subscription created
     */
    public getDeepLink(): string | null {
        return getCookie(DeepLinkURL)
    }

    /**
     * Get current User ID from cookies
     */
    public getUserID(): string | undefined {
        const uid = getCookie(UserIdKey);

        if (uid)
            return uid
    }

    /**
     * Reset everything. Remove User ID from cookies and flush events queue
     */
    public reset(): boolean {
        deleteCookie(UserIdKey);
        deleteCookie(EventsKey);

        return true;
    }

    /**
     * Track event
     * @param name - event name
     * @param properties - event properties
     * @param userProperties - user properties
     */
    public track(name: string, properties: ApphudHash, userProperties: ApphudHash): boolean {
        // generate unique id
        const event: EventData = {
            name: name,
            properties: properties || {},
            user_properties: userProperties || {},
            timestamp: u.timestamp(),
            insert_id: u.generateId()
        };

        log('event', event);

        this.ready((): void => {
            event.user_id = this.getUserID();
            event.device_id = this.getUserID();

            this.eventQueue.push(event);
            this.saveEventQueue();

            // wait in case navigating to reduce duplicate events
            setTimeout((): void => {
                this.trackEvent(event);
            }, 1000);
        });

        return true;
    };

    /**
     * Set email to current user
     * @param email - user email
     */
    public async setEmail(email: string): Promise<void> {
        const user = await this.createUser({email: email}, true)

        if (user)
            this.user = user
    }

    /**
     * Start SDK. Create user, set placements, paywalls and products to current state. Trigger ready. Operate variables and prices.
     */
    private async initializeApp(initial: boolean = true): Promise<void> {
        const user = await this.createUser(null, false);

        if (user)
            this.user = user

        this.setPlacementsAndProducts()
        this.setPaymentProvider()
        this.operateVariables()
        this.operateAttribution()

        this.setReady(initial)
    }

    /**
     * Show payment form with saved product to cookies
     * @param options - form options
     * @param product - product id - optional
     */
    public paymentForm(options: PaymentProviderFormOptions, product?: string): void {
        this.ready(async (): Promise<void> => {
            if (!this.currentProduct()) {
                logError("Payment form: product is required")
                return
            }

            if (!this.currentPaywall()) {
                logError("Payment form: paywall is required")
                return
            }

            if (!this.currentPlacement()) {
                logError("Payment form: placement is required")
                return
            }

            log("Initializing payment form with payment provider:", this.currentPaymentProvider)

            const productId = product || this.currentProduct()!.base_plan_id

            if (!productId) {
                logError("Unable to initializeApp the payment form because the product is absent.")
                return
            }

            if (!this.currentPaymentProvider) {
                logError("Unable to initializeApp the payment form because the payment provider is absent.");
                return
            }
            if (!this.user) {
                logError("Payment form: no user");
                return
            }

            const builder = new FormBuilder(this.currentPaymentProvider, this.user)

            const formEvents: LifecycleEventName[] = ["payment_form_initialized", "payment_form_ready", "payment_failure", "payment_success"]

            formEvents.forEach((formEvent) => {
                builder.on(formEvent, (e) => {
                    this.emit(formEvent, e)
                })
            })

            log("Show payment form for product:", productId)
            await builder.show(productId, this.currentPaywall()!.id, this.currentPlacement()!.id, options)
        })
    }

    /**
     * Save selected placement and price
     * @param placementID - number of placement
     * @param productIndex - number of price in placement paywall
     */
    public selectPlacementProduct(placementID: string, productIndex: number): void {
        log("Save placement and product", placementID, productIndex)

        this.setCurrentItems(placementID, productIndex)

        setCookie(SelectedProductIndex, `${placementID},${productIndex}`, SelectedProductDuration)

        this.emit("product_changed", this.currentProduct())
    }

    /**
     * Set attribution data to user
     * @param data - attribution data dictionary
     */
    public setAttribution(data: AttributionData): void {
        log("SetAttribution", data, this.getUserID()!)


        api.setAttribution(this.getUserID()!, data).then(r => log("Attribution set", r))
    }

    private operateAttribution() {
        log("Prepare Attribution")
        const attribution: AttributionData = {}

        this.ready((): void => {
            const apphudData = this.prepareApphudAttributionData()

            // prepare apphud attribution data
            if (apphudData) {
                attribution["apphud_attribution_data"] = apphudData
            }

            // prepare gtag attribution
            const gtagClientID = this.retrieveGtagClientID()
            if (gtagClientID) {
                log("gtag client_id:", gtagClientID)
                attribution["firebase_id"] = gtagClientID
            }

            // prepare facebook attribution
            if (typeof(window.fbq) !== 'undefined') {
                attribution["facebook_data"] = {
                    fbp: getCookie('_fbp'),
                    fbc: getCookie('_fbc'),
                }

                if (this.hashedUserID) {
                    console.log('set external_id to fb: ', this.hashedUserID);

                    window.fbq('trackCustom', 'ApphudInit', {
                        external_id: this.hashedUserID,
                    })
                }
            }

            this.setAttribution(attribution)
        })
    }

    private prepareApphudAttributionData(): Record<string, string | string[] | null> {
        const data = this.getQueryParamsAsJson()
        data["user_agent"] = navigator.userAgent
        data["referrer"] = document.referrer

        return data
    }

    /**
     * Retrieve client_id from gtag.js
     * @private
     */
    private retrieveGtagClientID(): string | null {
        if (typeof(window.gaGlobal) !== 'undefined') {
            return window.gaGlobal.vid
        }

        return null
    }


    private getQueryParamsAsJson(): Record<string, string | string[]> {
        const queryParams = new URLSearchParams(window.location.search);
        const result: Record<string, string | string[]> = {};

        queryParams.forEach((value, key) => {
            // Check if the key already exists
            if (result[key]) {
                // If it exists and is an array, append the new value
                if (Array.isArray(result[key])) {
                    (result[key] as string[]).push(value);
                } else {
                    // Convert to an array if it was a single value
                    result[key] = [result[key] as string, value];
                }
            } else {
                // If it doesn't exist, assign the value directly
                result[key] = value;
            }
        });

        return result;
    }

    /**
     * Sets current payment provider
     * @private
     */
    private setPaymentProvider(): void {
        this.ready((): void => {
            const paymentProviders = this.user?.payment_providers || []

            // get first payment provider
            if (paymentProviders.length > 0) {
                this.currentPaymentProvider = paymentProviders[0]
                log("Set payment provider:", this.currentPaymentProvider)
            }
        })
    }

    /**
     * Set language
     * @param language
     */
    public setLanguage(language: string): void {
        config.language = language
    }

    /**
     * Sets placements, paywalls and products
     * @private
     */
    private setPlacementsAndProducts(): void {
        this.ready((): void => {
            this.placements = this.user?.placements || []

            log("Placements", this.placements)
            const saved = this.getSavedPlacementProductIndex()

            if (saved.placementID)
                this.setCurrentItems(saved.placementID, saved.productIndex)
        })
    }

    /**
     * Trigger ready and run functions from queue
     * @private
     */
    private setReady(initial: boolean = false): void {
        log("set ready")
        let callback;
        while ((callback = this.queue.shift())) {
            callback();
        }
        this.isReady = true;

        if (initial) {
            this.emit("ready", this)
        }
    }

    /**
     * Save event queue
     * @private
     */
    private saveEventQueue(): void {
        if (canStringify) {
            setCookie(EventsKey, JSON.stringify(this.eventQueue), 1);
        }
    }

    /**
     * Adds device_id, user_id to event
     * @param event - event data
     * @private
     */
    private eventData(event: EventData): Events {
        const data: Events = {
            events: [event],
            device_id: event.device_id,
            user_id: event.user_id,
        }
        delete event.device_id;
        delete event.user_id;

        return data;
    }

    /**
     * Create event or add it to queue if not ready yet
     * @param event - event data
     * @private
     */
    private trackEvent(event: EventData): void {
        this.ready(async (): Promise<void> => {
            api.createEvent(this.eventData(event)).then(() => {
                // remove from queue
                for (let i = 0; i < this.eventQueue.length; i++) {
                    if (this.eventQueue[i].id === event.id) {
                        this.eventQueue.splice(i, 1)
                        break
                    }
                }
                this.saveEventQueue()
                this.initializeApp(false)
            })
        });
    }

    /**
     * Create user
     * @param params - user data
     * @param ready - reset readiness
     * @private
     */
    private async createUser(params: ApphudHash | null, ready: boolean): Promise<User | null> {
        this.isReady = ready;

        this.userID = this.getUserID();
        this.hashedUserID = await generateSHA256(this.userID);

        if (!this.userID) {
            this.userID = u.generateId();

            if (!getCookie(StartAppVersionKey)) {
                setCookie(StartAppVersionKey, config.websiteVersion, UserCookieDuration); // 2 years
            }

            setCookie(UserIdKey, this.userID, UserCookieDuration);
        }

        let data = this.userParams({})

        // referrer
        if (document.referrer.length > 0) {
            data.referrer = document.referrer;
        }

        log("user", data);

        if (params) {
            data = Object.assign(data, params);
        }

        return await api.createUser(data)
    }

    /**
     * Prepare user params
     * @param params - user data
     * @private
     */
    private userParams(params: ApphudHash): CustomerData {
        const userAgent = new UserAgent(navigator.userAgent);

        return {
            user_id: this.userID!,
            locale: u.getLocale(),
            time_zone: u.getTimeZone(),
            is_sandbox: config.debug,
            is_debug: config.debug,
            currency_code: u.getCurrencyCode(),
            country_iso_code: u.getCountryCode(),
            country_code: u.getCountryCode(),
            device_id: this.userID!,
            device_type: userAgent.getDevice().model ?? "unknown",
            device_family: userAgent.getDevice().model ?? "unknown",
            platform: "web2web",
            os_version: userAgent.getOS().version || u.getOSVersion(),
            app_version: config.websiteVersion,
            start_app_version: getCookie(StartAppVersionKey) || config.websiteVersion,
            need_paywalls: true,
            need_placements: true,
            page_url: window.location.href,
            user_agent: navigator.userAgent,
            ...params
        }
    }

    /**
     * Replace variables on the page
     */
    public operateVariables() {
        this.ready((): void => {
            log("Operate variables");

            const vars: NodeListOf<Element> = document.querySelectorAll(`[${VariableDataAttribute}]`);

            vars.forEach(elm => {
                const varName = elm.getAttribute(VariableDataAttribute)

                if (varName) {
                    const newVal = this.readVariableValueByKeyPath(varName)

                    log("Replace variable,", varName, newVal)

                    if (newVal) {
                        elm.innerHTML = newVal
                    }
                }
            })
        })
    }

    /**
     * Get saved product index from cookies
     * @private
     */
    private getSavedPlacementProductIndex(): { placementID: string | undefined, productIndex: number } {
        const savedIndices = getCookie(SelectedProductIndex)

        if (savedIndices !== null) {
            const arr = savedIndices.split(',').map(s => s.trim());

            if (arr.length === 2) {
                return {
                    placementID: arr[0],
                    productIndex: parseInt(arr[1]),
                }
            }
        }

        return {
            placementID: undefined,
            productIndex: 0,
        }
    }

    /**
     * Get variable value by name
     * @param key - variable name. Example: `product1.description.price`
     * @private
     */
    private readVariableValueByKeyPath(key: string): string | null {
        const keyArr = key.split(',').map(s => s.trim());

        // default indices
        let placementID: string | undefined = undefined
        let productIndex = 0

        // last element of string '0,1,path.to.var'
        // returns path.to.var
        const path = keyArr[keyArr.length - 1]

        if (keyArr.length == 3) {
            placementID = keyArr[0]
            productIndex = parseInt(keyArr[1])

            // if some of the parts are negative - get either saved values or default 0,0
            if (placementID === null || productIndex < 0) {
                const savedPlacementProduct = this.getSavedPlacementProductIndex()

                placementID = savedPlacementProduct.placementID
                productIndex = savedPlacementProduct.productIndex
            }
        } else if (keyArr.length === 1) {
            const savedPlacementProduct = this.getSavedPlacementProductIndex()

            placementID = savedPlacementProduct.placementID
            productIndex = savedPlacementProduct.productIndex
        }

        const placement = this.findPlacementByID(placementID!)

        if (!placement) {
            log("placement not found with id: ", placementID)
            return null
        }

        log("Placement", placementID, productIndex)
        const paywall = placement.paywalls[0]!
        const product = paywall!.items[productIndex]
        
        if (product !== null && product !== undefined && product.properties !== undefined) {
            return u.getValueByPath(product.properties, path)
        }

        return null
    }

    private findPlacementByID(id: string): Placement | undefined {
        return this.placements.find(elm => elm.identifier === id)
    }

    /**
     * Set current placement, paywall, product
     * @param placementID
     * @param productIndex
     * @private
     */
    private setCurrentItems(placementID: string, productIndex: number) {
        this._currentPlacement = this.findPlacementByID(placementID)
        if (this._currentPlacement !== null && this._currentPlacement !== undefined && this._currentPlacement.paywalls.length > 0) {
            this._currentPaywall = this._currentPlacement.paywalls[0]

            this._currentProduct = this._currentPaywall.items[productIndex]

            log("Current placement", this._currentPlacement)
            log("Current paywall", this._currentPaywall)
            log("Current product", this._currentProduct)
        }
    }

    public currentProduct(): Product | null {
        if (this._currentProduct)
            return this._currentProduct

        const paywall = this.currentPaywall()

        if (paywall !== null && paywall !== undefined) {
            return paywall!.items[0]
        }

        return null
    }

    public currentPlacement(): Placement | null {
        if (this._currentPlacement)
            return this._currentPlacement

        const placement = this.placements[0]

        if (placement !== null && placement !== undefined) {
            return placement!
        }

        return null
    }

    public currentPaywall(): Paywall | null {
        if (this._currentPaywall)
            return this._currentPaywall

        const placement = this.currentPlacement()

        if (placement !== null && placement !== undefined) {
            return placement!.paywalls[0]
        }

        return null
    }

    /**
     * Run function or add to queue
     * @param callback - function
     * @private
     */
    private ready(callback: ApphudFunc): void {
        if (this.isReady) {
            callback();
        } else {
            log('not ready push to queue', callback);
            this.queue.push(callback);
        }
    }
}
