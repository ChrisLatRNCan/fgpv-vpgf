(() => {
    'use strict';

    /**
     * @ngdoc service
     * @name legendService
     * @module app.geo
     * @requires dependencies
     * @description
     *
     * The `legendService` factory constructs the legend (auto or structured). `LayerRegistry` instantiates `LegendService` providing the current config, layers and legend containers.
     * This service also scrapes layer symbology.
     *
     */
    angular
        .module('app.geo')
        .factory('legendService', legendServiceFactory);

    function legendServiceFactory($translate, $http, $q, $timeout, gapiService,
            geometryTypes, layerTypes, layerStates, legendEntryFactory) {

        const legendSwitch = {
            structured: structuredLegendService,
            autopopulate: autoLegendService
        };

        return (config, ...args) => legendSwitch[config.legend.type](config, ...args);

        /**
         * Constrcuts and maintains autogenerated legend.
         * @param  {Object} config current config
         * @param  {Object} layerRegistry instance of `layerRegistry`
         * @return {Object}        instance of `legendService` for autogenerated legend
         */
        function autoLegendService() { // config, layerRegistry) { // FIXME: remove later if not needed
            // maps layerTypes to layer item generators
            const layerTypeGenerators = {
                esriDynamic: dynamicGenerator,
                esriFeature: featureGenerator,
                esriImage: imageGenerator,
                esriTile: tileGenerator,
                ogcWms: wmsGenerator
            };

            const service = {
                legend: legendEntryFactory.entryGroup(), // this is legend's invisible root group; to be consumed by toc

                addLayer,
                addPlaceholder,
                setLayerState,
                setLayerLoadingFlag
            };

            init();

            return service;

            /***/

            /**
             * Initializes autolegend by adding data and image groups to it.
             */
            function init() {
            }

            /**
             * Parses a dynamic layer object and creates a legend item (with nested groups and symbology)
             * For a dynamic layer, there are two visibility functions:
             *     - `setVisibility`: https://developers.arcgis.com/javascript/jsapi/arcgisdynamicmapservicelayer-amd.html#setvisibility
             *      sets visibility of the whole layer; if this is set to false, using `setVisibleLayers` will not change anything
             *
             *  - `setVisibleLayers`: https://developers.arcgis.com/javascript/jsapi/arcgisdynamicmapservicelayer-amd.html#setvisiblelayers
             *      sets visibility of sublayers;
             *
             * A tocEntry for a dynamic layer contains subgroups and leaf nodes, each one with a visibility toggle.
             *  - User clicks on leaf's visibility toggle:
             *      toggle visibility of the leaf's layer item;
             *      notify the root group of this dynamic layer;
             *      walk root's children to find out which leaves are visible, omitting any subgroups
             *      call `setVisibleLayers` on the layer object to change the visibility of the layer
             *
             *  - User clicks on subgroup's visibility toggle:
             *      toggle visibility of the subgroup item;
             *      toggle all its children (prevent children from notifying the root when they are toggled)
             *      notify the root group of this dynamic layer;
             *      walk root's children to find out which leaves are visible, omitting any subgroups
             *      call `setVisibleLayers` on the layer object to change the visibility of the layer
             *
             *  - User clicks on root's visibility toggle:
             *      toggle all its children (prevent children from notifying the root when they are toggled)
             *      walk root's children to find out which leaves are visible, omitting any subgroups
             *      call `setVisibleLayers` on the layer object to change the visibility of the layer
             *
             * @param  {Object} layer layer object from `layerRegistry`
             * @return {Object}       legend item
             */
            function dynamicGenerator(layer) {
                const state = legendEntryFactory.dynamicEntryMasterGroup(
                    layer.initialState, layer.layer, true);
                layer.state = state;

                const symbologyPromise = getMapServerSymbology(state.url);

                // wait for symbology to load and ...
                symbologyPromise.then(data =>  // ... and apply them to existing child items
                        data.layers.forEach(layer => applySymbology(state.slaves[layer.layerId], layer)));

                // assign feature counts only to active sublayers
                state.walkItems(layerEntry => {
                    getServiceFeatureCount(`${state.url}/${layerEntry.featureIdx}`).then(count =>
                        applyFeatureCount(layer.layer.geometryType, layerEntry, count));
                });

                return state;
            }

            /**
             * Parses a tile layer object and creates a legend item (with nested groups and symbology)
             * Uses the same logic as dynamic layers to generate symbology hierarchy
             * @param  {Object} layer layer object from `layerRegistry`
             * @return {Object}       legend item
             */
            function tileGenerator(layer) {
                const state = legendEntryFactory.dynamicEntryMasterGroup(
                    layer.initialState, layer.layer, true);
                layer.state = state;

                return state;
            }

            /**
             * Parses feature layer object and create a legend entry with symbology
             * @param  {Object} layer layer object from `layerRegistry`
             * @return {Object}       legend item
             */
            function featureGenerator(layer) {
                // generate toc entry
                const state = legendEntryFactory.singleEntryItem(layer.initialState, layer.layer);
                layer.state = state;

                const symbologyPromise = getMapServerSymbology(state.url);

                symbologyPromise.then(data =>
                    applySymbology(state, data.layers[state.featureIdx]));

                // assign feature count
                getServiceFeatureCount(`${state.url}/${state.featureIdx}`).then(count =>
                    applyFeatureCount(layer.layer.geometryType, state, count));

                return state;
            }

            /**
             * Parses esri image layer object and create a legend entry with symbology
             * @param  {Object} layer layer object from `layerRegistry`
             * @return {Object}       legend item
             */
            function imageGenerator(layer) {
                // generate toc entry
                const state = legendEntryFactory.singleEntryItem(layer.initialState, layer.layer);
                layer.state = state;

                return state;
            }

            /**
             * Parses WMS layer object and create a legend entry with symbology
             * @param  {Object} layer layer object from `layerRegistry`
             * @return {Object}       legend item
             */
            function wmsGenerator(layer) {
                const state = legendEntryFactory.singleEntryItem(layer.initialState, layer.layer);
                state.symbology = gapiService.gapi.layer.ogc
                    .getLegendUrls(layer.layer, state.layerEntries.map(le => le.id))
                    .map((url, idx) => {
                        // jscs:disable maximumLineLength
                        // FIXME remove the horrible URL when the TODO in entry-symbology.html is complete (icon should then be null / undefined)
                        return { name: state.layerEntries[idx].name || state.layerEntries[idx].id, icon: url || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAUJJREFUeNrs172Kg0AQB/BcOLHSRhBFEF/B5/cBrMRGsLESFBFsFAs/ivuTheW4kOBN1mSLmWJB0PGHM6vjV5IkF/3ietEymMUsZjGLWcxiltas7+OnNk3T9/22bYTbGIbhum4QBIpZMJVl+coDGIYB60HZUVZd11ht27Ysi2CapmkcRyRRzFqWBWsYhp7nEVhd1xVFIZLwTnwQaMd1XfVi5XmOjZJlGUF2Pc8ktt48z23basGSpg/0FkqTpinKpNxEZ8GEpkGB0NS/ZUpMRJY0iUN8kdSaKKw/Jsdx4jhWa6KwsK3ONr3U8ueZ6KxTTf+btyQIw5MYBDAXuLd4fgnmDll3xSzTNPd9l5PJ/evqSWCkEecjiWKW7/tVVY23IJcGSRSzoihC7bQbmsW8ezwv/5Axi1nMYhazmMWst8ePAAMA0CzGRisOjIgAAAAASUVORK5CYII=' };
                        // jscs:enable maximumLineLength
                    });
                layer.state = state;

                return state;
            }

            /**
             * Add a placeholder for the provided layer
             *
             * @param {Object} layer object from `layerRegistry` `layers` object
             */
            function addPlaceholder(layer) {
                const entry = legendEntryFactory.placeholderEntryItem(layer.initialState, layer.layer);
                layer.state = entry;

                service.legend.add(entry);
            }

            /**
             * Add a provided layer to the appropriate group;
             *
             * TODO: hide groups with no layers;
             * @param {Object} layer object from `layerRegistry` `layers` object
             * @param {Number} index position to insert layer into the legend
             */
            function addLayer(layer, index) {
                const layerType = layer.initialState.layerType;
                const entry = layerTypeGenerators[layerType](layer);

                // layerTypeGroups[layerType].add(entry);
                service.legend.add(entry, index);
            }

            /**
             * Sets state of the layer entry: error, default, out-of-scale, etc
             * @param {Object} entry entry object from the legend
             * @param {String} state defaults to `default`; state name
             * @param {Number} delay defaults to 0; delay before setting the state
             */
            function setLayerState(entry, state = layerStates.default, delay = 0) {
                // same as with map loading indicator, need timeout since it's a non-Angular async call
                $timeout.cancel(entry._stateTimeout);
                entry._stateTimeout = $timeout(() => {
                    entry.state = state;
                }, delay);
            }

            /**
             * Sets `isLoading` flag on the legend entry.
             * @param {Object} entry entry object from the legend
             * @param {Boolean} isLoading defaults to true; flag indicating if the layer is updating their content
             * @param {Number} delay defaults to 0; delay before setting the state
             */
            function setLayerLoadingFlag(entry, isLoading = true, delay = 0) {
                // same as with map loading indicator, need timeout since it's a non-Angular async call
                $timeout.cancel(entry._loadingTimeout);
                entry._loadingTimeout = $timeout(() => {
                    entry.isLoading = isLoading;
                }, delay);
            }
        }

        // TODO: maybe this should be split into a separate service; it can get messy otherwise in here
        function structuredLegendService() {

        }

        /**
         * TODO: Work in progress... Works fine for feature layers only right now; everything else gest a generic icon;
         * TODO: move to geoapi as it's stateless and very specific
         * Scrapes feaure and dynamic layers for their symbology;
         *
         * @param  {String} layerUrl service url
         * @returns {Array} array of legend items
         */
        function getMapServerSymbology(layerUrl) {
            return $http.jsonp(`${layerUrl}/legend?f=json&callback=JSON_CALLBACK`)
                .then(result => {
                    // console.log(legendUrl, index, result);

                    if (result.data.error) {
                        return $q.reject(result.data.error);
                    }

                    return result.data;
                })
                .catch(error => {
                    // TODO: apply default symbology to the layer in question in this case
                    console.error(error);
                });
        }

        /**
        * Get feature count from a layer.
         * @param  {String} layerUrl layer url
         * @return {Promise}          promise resolving with a feature count
         */
        function getServiceFeatureCount(layerUrl) {
            /* jscs:disable maximumLineLength */
            return $http.jsonp(`${layerUrl}/query?where=1=1&returnCountOnly=true&returnGeometry=false&f=json&callback=JSON_CALLBACK`)
                .then(result => {
                    console.log(layerUrl, result);
                    return result.data.count;
                });
            /* jscs:enable maximumLineLength */
        }

        /**
         * Applies feature count to the toc entries.
         * @param  {String} geometryType one of geometry types
         * @param  {Object} state legend entry object
         * @param  {Number} count  number of features in the layer
         */
        function applyFeatureCount(geometryType, state, count) {
            state.features.count = count;

            $translate(geometryTypes[geometryType]).then(type =>
                state.features.type = type.split('|')[state.features.count > 1 ? 1 : 0]);
        }

        /**
         * Applies retrieved symbology to the layer item's state
         * @param  {Object} state     layer item
         * @param  {Object} layerData data from the legend endpoint
         */
        function applySymbology(state, layerData) {
            state.symbology = layerData.legend.map(item => {
                return {
                    icon: `data:${item.contentType};base64,${item.imageData}`,
                    name: item.label
                };
            });
        }
    }
})();