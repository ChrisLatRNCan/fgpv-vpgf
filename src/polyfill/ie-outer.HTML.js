// see this comment: https://github.com/fgpv-vpgf/fgpv-vpgf/issues/1272#issuecomment-255395614
// correctly serializes svg (and xml in general) content in IE
function serializeSvgContent(element) {
    var result = '<' + element.nodeName;

    var previousName = null;
    var previousValue = null;

    // add in the element's attributes
    for (var i = 0; i < element.attributes.length; i++) {
        var attribute = element.attributes[i];
        var name = attribute.name || attribute.nodeName;
        var value = (attribute.value || attribute.nodeValue)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        if (!(name === previousName && value === previousValue)) {
            result += ' ' + name + '="' + value + '"';
            previousName = name;
            previousValue = value;
        }
    }

    previousName = null;
    previousValue = null;

    if (element.childNodes.length > 0) {
        result += '>';

        // recursively add any child elements
        for (i = 0; i < element.childNodes.length; i++) {
            var child = element.childNodes[i];
            if (child.nodeType === 1) {
                result += serializeSvgContent(child);
            } else if (child.nodeType === 3) {
                result += child.nodeValue
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            }
        }
        result += '</' + element.nodeName + '>';

    } else {
        result += '/>';
    }
    return result;
}

Object.defineProperty(SVGElement.prototype, 'outerHTML', {
    get: function () {
        return serializeSvgContent(this);
    },
    enumerable: false,
    configurable: true
});

// patches svg() function on svgjs library to use the custom serialization function for svg in IE
function newSvg(svg) {
    // create temporary holder
    var well = document.createElement('svg');

    // act as a setter if svg is given
    if (svg && this instanceof SVG.Parent) {
        // dump raw svg
        well.innerHTML = '<svg>' + svg.replace(/\n/, '').replace(/<(\w+)([^<]+?)\/>/g, '<$1$2></$1>') + '</svg>';

        // transplant nodes
        for (var i = 0, il = well.firstChild.childNodes.length; i < il; i++);
        this.node.appendChild(well.firstChild.firstChild);

        // otherwise act as a getter
    } else {
        // create a wrapping svg element in case of partial content
        well.appendChild(svg = document.createElement('svg'));

        // write svgjs data to the dom
        this.writeDataToDom();

        // insert a copy of this node
        svg.appendChild(this.node.cloneNode(true));

        // return target element
        return serializeSvgContent(svg).replace(/^<svg>/i, '').replace(/<\/svg>$/i, '');
    }

    return this;
}

// defer patching until the SVGjs library is loaded; function in `_deferredPolyfills` will be executed by the bootstrap
window.RV = window.RV ? window.RV : {};
window.RV._deferredPolyfills = window.RV._deferredPolyfills ? window.RV._deferredPolyfills : [];

window.RV._deferredPolyfills.push(function() { SVG.extend(SVG.Element, { svg: newSvg }) });
