/**
 * Xibo - Digital Signage - http://www.xibo.org.uk
 * Copyright (C) 2006-2018 Daniel Garner
 *
 * This file is part of Xibo.
 *
 * Xibo is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Xibo is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Xibo.  If not, see <http://www.gnu.org/licenses/>.
 */

// Include handlebars templates
const designerMainTemplate = require('../templates/designer.hbs');
const messageTemplate = require('../templates/message.hbs');
const loadingTemplate = require('../templates/loading.hbs');

// Include modules
const Region = require('./region.js');
const Layout = require('./layout.js');
const Widget = require('./widget.js');
const Navigator = require('./navigator.js');
const Timeline = require('./timeline.js');
const Manager = require('./manager.js');
const Viewer = require('./viewer.js');
const toolbar = require('./toolbar.js');
const PropertiesPanel = require('./properties-panel.js');

// Include CSS
require('../css/designer.css');

// Create layout designer namespace (lD)
window.lD = {

    // Main object info
    mainObjectType: 'layout',
    mainObjectId: '',

    // Navigator
    navigator: {},
    navigatorEdit: {},

    // Layout
    layout: {},

    // Timeline
    timeline: {},

    // Manager
    manager: {},

    // Viewer
    viewer: {},

    // Designer DOM div
    designerDiv: $('#layout-editor'),

    // Selected object
    selectedObject: {},

    // Bottom toolbar
    toolbar: {},

    // Properties Panel
    propertiesPanel: {},
};

// Get Xibo app
window.getXiboApp = function() {
    return lD;
};

// Load Layout and build app structure
$(document).ready(function() {
    // Get layout id
    const layoutId = lD.designerDiv.attr("data-layout-id");
    
    // Append loading html to the main div
    lD.designerDiv.html(loadingTemplate());

    // Load layout through an ajax request
    $.get(urlsForApi.layout.get.url + '?layoutId=' + layoutId + '&embed=regions,playlists,widgets')
        .done(function(res) {

            if(res.data.length > 0) {

                // Append layout html to the main div
                lD.designerDiv.html(designerMainTemplate());

                // Create layout
                lD.layout = new Layout(layoutId, res.data[0]);

                // Update main object id
                lD.mainObjectId = lD.layout.layoutId;

                // Initialize navigator
                lD.navigator = new Navigator(
                    // Small container
                    lD.designerDiv.find('#layout-navigator')
                );

                // Initialize timeline
                lD.timeline = new Timeline(
                    lD.designerDiv.find('#layout-timeline')
                );

                // Initialize manager
                lD.manager = new Manager(
                    lD.designerDiv.find('#layout-manager'),
                    (serverMode == 'Test')
                );

                // Initialize viewer
                lD.viewer = new Viewer(
                    lD.designerDiv.find('#layout-viewer'),
                    lD.designerDiv.find('#layout-viewer-navbar')
                );

                // Initialize bottom toolbar ( with custom buttons )
                lD.toolbar = new toolbar(
                    lD.designerDiv.find('#layout-editor-toolbar'),
                    // Custom buttons
                    [
                        {
                            id: 'publishLayout',
                            title: layoutDesignerTrans.publishTitle,
                            logo: 'fa-check-square-o',
                            class: 'btn-success',
                            action: lD.showPublishScreen
                        },
                        {
                            id: 'undoLastAction',
                            title: layoutDesignerTrans.undo,
                            logo: 'fa-undo',
                            class: 'btn-warning',
                            activeCheck: function(){
                                return (lD.manager.changeHistory.length > 0);
                            },
                            action: lD.undoLastAction
                        }
                    ],
                    // Custom actions
                    {
                        deleteSelectedObjectAction: lD.deleteSelectedObject,
                        deleteDraggedObjectAction: lD.deleteDraggedObject
                    },
                    // jumpList
                    {
                        searchLink: urlsForApi.layout.get.url,
                        designerLink: urlsForApi.layout.designer.url,
                        layoutId: lD.layout.layoutId,
                        layoutName: lD.layout.name,
                        callback: lD.reloadData
                    }
                );

                // Initialize properties panel
                lD.propertiesPanel = new PropertiesPanel(
                    lD.designerDiv.find('#properties-panel')
                );


                if(res.data[0].publishedStatusId != 2) {
                    // Show checkout screen
                    lD.showCheckoutScreen(lD.layout);
                }

                // Setup helpers
                formHelpers.setup(lD, lD.layout);

                // Call layout status every minute
                setInterval(lD.layoutStatus, 1000 * 60); // Every minute

                // Default selected object is the layout
                lD.selectObject();
            } else {
                lD.showErrorMessage();
            }
        }).fail(function(jqXHR, textStatus, errorThrown) {

            // Output error to console
            console.error(jqXHR, textStatus, errorThrown);

            lD.showErrorMessage();
        }
    );

    // When in edit mode, enable click on background to close navigator
    lD.designerDiv.find('#layout-navigator-edit').click(function(event) {
        if(event.target.id === 'layout-navigator-edit') {
            lD.toggleNavigatorEditing(false);
        }
    });

    // Refresh some modules on window resize
    $(window).resize($.debounce(500, function(e) {
        if(e.target === window) {

            // Refresh navigators and viewer
            lD.renderContainer(lD.navigator);
            lD.renderContainer(lD.navigatorEdit);
            lD.renderContainer(lD.viewer, lD.selectedObject);
        }
    }));
});

/**
 * Select a layout object (layout/region/widget)
 * @param {object=} obj - Object to be selected
 * @param {bool=} forceSelect - Select object even if it was already selected
 */
lD.selectObject = function(obj = null, forceSelect = false) {

    // Get object properties from the DOM ( or set to layout if not defined )
    const newSelectedId = (obj === null) ? this.layout.id : obj.attr('id');
    const newSelectedType = (obj === null) ? 'layout' : obj.data('type');

    const oldSelectedId = this.selectedObject.id;
    const oldSelectedType = this.selectedObject.type;
    
    // Unselect the previous selectedObject object if still selected
    if( this.selectedObject.selected ) {

        switch(this.selectedObject.type) {
            case 'region':
                if(this.layout.regions[this.selectedObject.id]) {
                    this.layout.regions[this.selectedObject.id].selected = false;
                }
                break;

            case 'widget':
                if(this.layout.regions[this.selectedObject.regionId].widgets[this.selectedObject.id]) {
                    this.layout.regions[this.selectedObject.regionId].widgets[this.selectedObject.id].selected = false;
                }
                break;

            default:
                break;
        }
        
    }
    
    // Set to the default object
    this.selectedObject = this.layout;
    this.selectedObject.type = 'layout';

    // If the selected object was different from the previous, select a new one
    if(oldSelectedId != newSelectedId || forceSelect) {

        // Save the new selected object
        if(newSelectedType === 'region') {
            this.layout.regions[newSelectedId].selected = true;
            this.selectedObject = this.layout.regions[newSelectedId];
        } else if(newSelectedType === 'widget') {
            this.layout.regions[obj.data('widgetRegion')].widgets[newSelectedId].selected = true;
            this.selectedObject = this.layout.regions[obj.data('widgetRegion')].widgets[newSelectedId];
        }

        this.selectedObject.type = newSelectedType;
    }

    // Refresh the designer containers
    this.refreshDesigner();
};

/**
 * Refresh designer
 */
lD.refreshDesigner = function() {

    // Remove temporary data
    this.clearTemporaryData();

    // Render containers with layout ( default )
    this.renderContainer(this.navigator);
    this.renderContainer(this.navigatorEdit);
    this.renderContainer(this.timeline);
    this.renderContainer(this.toolbar);
    this.renderContainer(this.manager);

    // Render selected object in the following containers
    this.renderContainer(this.propertiesPanel, this.selectedObject);
    this.renderContainer(this.viewer, this.selectedObject);
};


/**
 * Reload API data and replace the layout structure with the new value
 * @param {object} layout - previous layout
 */
lD.reloadData = function(layout) {

    const layoutId = (typeof layout.layoutId == 'undefined') ? layout : layout.layoutId;

    $.get(urlsForApi.layout.get.url + '?layoutId=' + layoutId + "&embed=regions,playlists,widgets")
        .done(function(res) {
            
            if(res.data.length > 0) {
                lD.layout = new Layout(layoutId, res.data[0]);

                // Update main object id
                lD.mainObjectId = lD.layout.layoutId;

                // Select the same object ( that will refresh the layout too )
                const selectObjectId = lD.selectedObject.id;
                lD.selectedObject = {};

                lD.selectObject($('#' + selectObjectId));
            } else {
                lD.showErrorMessage();
            }
        }).fail(function(jqXHR, textStatus, errorThrown) {

            // Output error to console
            console.error(jqXHR, textStatus, errorThrown);

            lD.showErrorMessage();
        }
    );
};

/**
 * Checkout layout
 */
lD.checkoutLayout = function() {

    const linkToAPI = urlsForApi.layout.checkout;
    let requestPath = linkToAPI.url;

    // replace id if necessary/exists
    requestPath = requestPath.replace(':id', lD.layout.layoutId);

    $.ajax({
        url: requestPath,
        type: linkToAPI.type
    }).done(function(res) {
        if(res.success) {
            toastr.success(res.message);
            
            lD.reloadData(res.data);

            bootbox.hideAll();
        } else {
            toastr.error(res.message);
        }
    }).fail(function(jqXHR, textStatus, errorThrown) {
        // Output error to console
        console.error(jqXHR, textStatus, errorThrown);
    });
};

/**
 * Publish layout
 */
lD.publishLayout = function() {

    const linkToAPI = urlsForApi.layout.publish;
    let requestPath = linkToAPI.url;

    // replace id if necessary/exists
    requestPath = requestPath.replace(':id', lD.layout.parentLayoutId);

    $.ajax({
        url: requestPath,
        type: linkToAPI.type
    }).done(function(res) {
        if(res.success) {
            toastr.success(res.message);

            window.location.href = urlsForApi.layout.list.url;
            
        } else {
            toastr.error(res.message);
        }
    }).fail(function(jqXHR, textStatus, errorThrown) {
        // Output error to console
        console.error(jqXHR, textStatus, errorThrown);
    });
};

/**
 * Render layout structure to container, if it exists
 * @param {object} container - Container for the layout to be rendered
 * @param {object=} element - Element to be rendered, if not used, render layout
 */
lD.renderContainer = function(container, element = {}) {
    // Check container to prevent rendering to an empty container
    if(!jQuery.isEmptyObject(container)) {

        // Render element if defined, layout otherwise
        if(!jQuery.isEmptyObject(element)) {
            container.render(element, this.layout);
        } else {
            container.render(this.layout);
        }
    }
};

/**
 * Toggle editing functionality on Navigator
 * @param {boolean} enable - flag to toggle the editing
 */
lD.toggleNavigatorEditing = function(enable) {

    // Unselect objects ( select layout )
    this.selectObject();

    if(enable) {
        // Create a new navigator instance
        this.navigatorEdit = new Navigator(
            this.designerDiv.find('#layout-navigator-edit-content'),
            {
                edit: true,
                editNavbar: this.designerDiv.find('#layout-navigator-edit-navbar')
            }
        );

        // Show navigator edit div
        this.designerDiv.find('#layout-navigator-edit').css('display', 'block');

        // Render navigator
        this.renderContainer(this.navigatorEdit);

    } else {

        // Refresh designer
        this.refreshDesigner();

        // Clean variable
        this.navigatorEdit = {};

        // Clean object HTML and hide div
        this.designerDiv.find('#layout-navigator-edit-content').empty();
        this.designerDiv.find('#layout-navigator-edit').css('display', 'none');

    }
};

/**
 * Layout loading error message
 */
lD.showErrorMessage = function() {
    // Output error on screen
    const htmlError = messageTemplate({
        messageType: 'danger',
        messageTitle: 'ERROR',
        messageDescription: 'There was a problem loading the layout!'
    });

    lD.designerDiv.html(htmlError);
};

/**
 * Layout checkout screen
 */
lD.showCheckoutScreen = function() {
    
    bootbox.dialog({
        title: layoutDesignerTrans.checkoutTitle + ' ' + lD.layout.name,
        message: layoutDesignerTrans.checkoutMessage,
        closeButton: false,
        buttons: {
            done: {
                label: layoutDesignerTrans.checkoutTitle,
                className: "btn-primary btn-lg",
                callback: function(res) {

                    $(res.currentTarget).append('<i class="fa fa-cog fa-spin"></i>');

                    lD.checkoutLayout();

                    // Prevent the modal to close ( close only when chekout layout resolves )
                    return false;
                }
            }
        }
    });
};

/**
 * Layout checkout screen
 */
lD.showPublishScreen = function() {

    bootbox.dialog({
        title: layoutDesignerTrans.publishTitle + ' ' + lD.layout.name,
        message: layoutDesignerTrans.publishMessage,
        buttons: {
            cancel: {
                label: translations.cancel,
                className: "btn-default",
            },
            done: {
                label: layoutDesignerTrans.publishTitle,
                className: "btn-primary btn-lg",
                callback: function(res) {

                    $(res.currentTarget).append('<i class="fa fa-cog fa-spin"></i>');

                    lD.publishLayout();

                    // Prevent the modal to close ( close only when chekout layout resolves )
                    return false;
                }
            }
        }
    });
};

/**
 * Revert last action
 */
lD.undoLastAction = function() {
    lD.manager.revertChange().then((res) => { // Success

        toastr.success(res.message);

        // Refresh designer according to local or API revert
        if(res.localRevert) {
            lD.refreshDesigner();
        } else {
            lD.reloadData(lD.layout);
        }
    }).catch((error) => { // Fail/error

        // Show error returned or custom message to the user
        let errorMessage = 'Revert failed: ';

        if(typeof error == 'string') {
            errorMessage += error;
        } else {
            errorMessage += error.errorThrown;
        }

        toastr.error(errorMessage);
    });
};


/**
 * Delete selected object
 */
lD.deleteSelectedObject = function() {
    lD.deleteObject(lD.selectedObject.type, lD.selectedObject[lD.selectedObject.type+'Id']);
};

/**
 * Delete dragged object
 * @param {object} draggable - "jqueryui droppable" ui draggable object
 */
lD.deleteDraggedObject = function(draggable) {
    const objectType = draggable.data('type');
    let objectId = null;

    if(objectType === 'region') {
        objectId = lD.layout.regions[draggable.attr('id')].regionId;
    } else if(objectType === 'widget') {
        objectId = lD.layout.regions[draggable.data('widgetRegion')].widgets[draggable.data('widgetId')].widgetId;
    }

    lD.deleteObject(objectType, objectId);
};

/**
 * Delete object
 * @param {object} objectToDelete - menu to load content for
 */
lD.deleteObject = function(objectType, objectId) {

    if(objectType === 'region' || objectType === 'widget') {

        bootbox.confirm({
            title: 'Delete ' + objectType,
            message: 'Are you sure? All changes related to this object will be erased',
            buttons: {
                confirm: {
                    label: 'Yes',
                    className: 'btn-danger'
                },
                cancel: {
                    label: 'No',
                    className: 'btn-default'
                }
            },
            callback: function(result) {
                if(result) {

                    // Delete element from the layout
                    lD.layout.deleteElement(objectType, objectId).then((res) => { // Success

                        // Behavior if successful 
                        toastr.success(res.message);
                        lD.reloadData(lD.layout);
                    }).catch((error) => { // Fail/error
                        // Show error returned or custom message to the user
                        let errorMessage = 'Delete element failed: ' + error;

                        if(typeof error == 'string') {
                            errorMessage += error;
                        } else {
                            errorMessage += error.errorThrown;
                        }

                        toastr.error(errorMessage);
                    });
                }
            }
        });
    }
};

/**
 * Add action to take after dropping a draggable item
 * @param {object} droppable - Target drop are object
 * @param {object} draggable - Dragged object
 */
lD.dropItemAdd = function(droppable, draggable) {

    const droppableId = $(droppable).attr('id');
    const droppableType = $(droppable).data('type');

    const draggableType = $(draggable).data('type');

    // Get playlist Id
    const playlistId = lD.layout.regions[droppableId].playlists.playlistId;

    /**
     * Add dragged item to region
     */
    if(draggableType == 'media') { // Adding media from search tab to a region

        // Get media Id
        const mediaToAdd = {
            media: [
                $(draggable).data('mediaId')
            ]
        };

        // Create change to be uploaded
        lD.manager.addChange(
            'addMedia',
            'playlist', // targetType 
            playlistId,  // targetId
            null,  // oldValues
            mediaToAdd, // newValues
            {
                updateTargetId: true,
                updateTargetType: 'widget'
            }
        ).then((res) => { // Success

            // Behavior if successful 
            toastr.success(res.message);
            lD.timeline.resetZoom();
            lD.reloadData(lD.layout);
        }).catch((error) => { // Fail/error

            // Show error returned or custom message to the user
            let errorMessage = 'Add media failed: ';

            if(typeof error == 'string') {
                errorMessage += error;
            } else {
                errorMessage += error.errorThrown;
            }

            toastr.error(errorMessage);
        });
    } else { // Add widget/module

        // Get regionSpecific property
        const regionSpecific = $(draggable).data('regionSpecific');

        if(regionSpecific == 0) { // Upload form if not region specific

            const validExt = $(draggable).data('validExt').replace(/,/g, "|");

            lD.openUploadForm({
                trans: playlistTrans,
                upload: {
                    maxSize: $(draggable).data().maxSize,
                    maxSizeMessage: $(draggable).data().maxSizeMessage,
                    validExtensionsMessage: translations.validExtensions + ': ' + $(draggable).data('validExt'),
                    validExt: validExt
                },
                playlistId: playlistId
            }, {
                    main: {
                        label: translations.done,
                        className: "btn-primary",
                        callback: function() {
                            lD.timeline.resetZoom();
                            lD.reloadData(lD.layout);
                        }
                    }
                });

        } else { // Load add widget form for region specific

            // Get playlist Id
            const playlistId = lD.layout.regions[droppableId].playlists.playlistId;

            // Load form the API
            const linkToAPI = urlsForApi.playlist.addWidgetForm;

            let requestPath = linkToAPI.url;

            // Replace type
            requestPath = requestPath.replace(':type', draggableType);

            // Replace playlist id
            requestPath = requestPath.replace(':id', playlistId);

            // Select region ( and avoid deselect if region was already selected )
            lD.selectObject($(droppable), true);

            // Create dialog
            var calculatedId = new Date().getTime();

            let dialog = bootbox.dialog({
                title: 'Add ' + draggableType + ' widget',
                message: '<p><i class="fa fa-spin fa-spinner"></i> Loading...</p>',
                buttons: {
                    cancel: {
                        label: translations.cancel,
                        className: "btn-default"
                    },
                    done: {
                        label: translations.done,
                        className: "btn-primary test",
                        callback: function(res) {

                            // Run form open module optional function
                            if(typeof window[draggableType + '_form_add_submit'] === 'function') {
                                window[draggableType + '_form_add_submit'].bind(dialog)();
                            }

                            // If form is valid, submit it ( add change )
                            if($(dialog).find('form').valid()) {

                                const form = dialog.find('form');

                                lD.manager.addChange(
                                    'addWidget',
                                    'playlist', // targetType 
                                    playlistId,  // targetId
                                    null,  // oldValues
                                    form.serialize(), // newValues
                                    {
                                        updateTargetId: true,
                                        updateTargetType: 'widget',
                                        customRequestPath: {
                                            url: form.attr('action'),
                                            type: form.attr('method')
                                        }
                                    }
                                ).then((res) => { // Success

                                    // Behavior if successful 
                                    toastr.success(res.message);

                                    dialog.modal('hide');

                                    lD.timeline.resetZoom();
                                    lD.reloadData(lD.layout);

                                }).catch((error) => { // Fail/error

                                    // Show error returned or custom message to the user
                                    let errorMessage = '';

                                    if(typeof error == 'string') {
                                        errorMessage += error;
                                    } else {
                                        errorMessage += error.errorThrown;
                                    }

                                    // Remove added change from the history manager
                                    lD.manager.removeLastChange();

                                    // Display message in form
                                    formHelpers.displayErrorMessage(dialog.find('form'), errorMessage, 'danger');

                                    // Show toast message
                                    toastr.error(errorMessage);
                                });
                            }

                            // Prevent the modal to close ( close only when addChange returns true )
                            return false;
                        }
                    }
                }
            }).attr("id", calculatedId);

            // Request and load element form
            $.ajax({
                url: requestPath,
                type: linkToAPI.type
            }).done(function(res) {

                if(res.success) {
                    // Add title
                    dialog.find('.modal-title').html(res.dialogTitle);

                    // Add body main content
                    dialog.find('.bootbox-body').html(res.html);

                    dialog.data('extra', res.extra);

                    // Call Xibo Init for this form
                    XiboInitialise("#" + dialog.attr("id"));

                    // Run form open module optional function
                    if(typeof window[draggableType + '_form_add_open'] === 'function') {
                        window[draggableType + '_form_add_open'].bind(dialog)();
                    }

                } else {

                    // Login Form needed?
                    if(res.login) {

                        window.location.href = window.location.href;
                        location.reload(false);
                    } else {

                        toastr.error('Element form load failed!');

                        // Just an error we dont know about
                        if(res.message == undefined) {
                            console.error(res);
                        } else {
                            console.error(res.message);
                        }

                        dialog.modal('hide');
                    }
                }
            }).catch(function(jqXHR, textStatus, errorThrown) {

                console.error(jqXHR, textStatus, errorThrown);
                toastr.error('Element form load failed!');

                dialog.modal('hide');
            });
        }
    }
};


/**
 * Open Upload Form
 * @param {object} templateOptions
 * @param {object} buttons
 */
lD.openUploadForm = function(templateOptions, buttons) {

    // Close the current dialog
    bootbox.hideAll();

    var template = Handlebars.compile($("#template-file-upload").html());

    // Handle bars and open a dialog
    bootbox.dialog({
        message: template(templateOptions),
        title: playlistTrans.uploadMessage,
        buttons: buttons,
        animate: false,
        updateInAllChecked: uploadFormUpdateAllDefault,
        deleteOldRevisionsChecked: uploadFormDeleteOldDefault
    });

    lD.openUploadFormModelShown($(".modal-body").find("form"));
};

/**
 * Modal shown
 * @param {object} form
 */
lD.openUploadFormModelShown = function(form) {

    // Configure the upload form
    var url = libraryAddUrl;

    // Initialize the jQuery File Upload widget:
    form.fileupload({
        url: url,
        disableImageResize: true
    });

    // Upload server status check for browsers with CORS support:
    if($.support.cors) {
        $.ajax({
            url: url,
            type: 'HEAD'
        }).fail(function() {
            $('<span class="alert alert-error"/>')
                .text('Upload server currently unavailable - ' + new Date())
                .appendTo(form);
        });
    }

    // Enable iframe cross-domain access via redirect option:
    form.fileupload(
        'option',
        'redirect',
        window.location.href.replace(
            /\/[^\/]*$/,
            '/cors/result.html?%s'
        )
    );

    form.bind('fileuploadsubmit', function(e, data) {
        var inputs = data.context.find(':input');
        if(inputs.filter('[required][value=""]').first().focus().length) {
            return false;
        }
        data.formData = inputs.serializeArray().concat(form.serializeArray());

        inputs.filter("input").prop("disabled", true);
    });
};

/**
 * Clear Temporary Data ( Cleaning cached variables )
 */
lD.clearTemporaryData = function() {
    
    // Remove text callback editor structure variables
    formHelpers.textCallbackDestroy();
};

/**
 * Get element from the main object ( Layout )
 * @param {string} type
 * @param {number} id
 * @param {number} auxId
 */
lD.getElementByTypeAndId = function(type, id, auxId) {

    let element = {};

    if(type === 'layout') {
        element = lD.layout;
    } else if(type === 'region') {
        element = lD.layout.regions[id];
    } else if(type === 'widget') {
        element = lD.layout.regions[auxId].widgets[id];
    }

    return element;
};


/**
 * Call layout status
 */
lD.layoutStatus = function() {
    
    const linkToAPI = urlsForApi.layout.status;
    let requestPath = linkToAPI.url;

    // replace id if necessary/exists
    requestPath = requestPath.replace(':id', lD.layout.layoutId);

    $.ajax({
        url: requestPath,
        type: linkToAPI.type
    }).done(function(res) {
        if(!res.success) {
            console.error('Get status error');
        }
    }).fail(function(jqXHR, textStatus, errorThrown) {
        // Output error to console
        console.error(jqXHR, textStatus, errorThrown);
    });
};
