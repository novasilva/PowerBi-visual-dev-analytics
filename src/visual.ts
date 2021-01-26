/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import DataViewObject = powerbi.DataViewObject;
import DataViewObjects = powerbi.DataViewObjects;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import PrimitiveValue = powerbi.PrimitiveValue;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;


import { dataRoleHelper, dataViewObjects, dataViewObject } from "powerbi-visuals-utils-dataviewutils";

import * as d3 from "d3";

import * as _ from "lodash";

import { VisualSettings, LineStyle, constantLineSettings } from "./settings";

interface DataPoint {
    category: string;
    value: PrimitiveValue;
}

interface ViewModel {
    dataView: DataView;
    dataPoints: DataPoint[];
    dataMax: number;
    settings: VisualSettings;
    isCategoryFilled: boolean;
    isValuesFilled: boolean;
}

interface margin {
    top: number;
    right: number;
    bottom: number;
    left: number;

}

type Selection<T1, T2 = T1> = d3.Selection<any, T1, any, T2>;

export class Visual implements IVisual {
    private visualDiv: Selection<any>;
    private svgContainer: Selection<any>
    private settings: VisualSettings;
    private viewModel: ViewModel;
    private host: IVisualHost;

    constructor(options: VisualConstructorOptions) {
        console.log('Visual constructor', options);
        this.init(options);

    }

    public update(options: VisualUpdateOptions) {
        if (!options || !options.dataViews || !options.dataViews[0]) {
            this.clearViewport();
            return;
        }
        console.clear();
        console.log('Visual update', options);

        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);

        this.viewModel = Visual.converter(
            options.dataViews[0],
            this.host,
            this.settings
        );

        console.log("viewModel:");
        console.log(this.viewModel);

        if (!this.viewModel || _.isEmpty(this.viewModel.dataPoints)) {
            this.clearViewport();
            return;
        }
        console.log("renderVisual:");
        this.renderVisual(options);
    }

    private static parseSettings(dataView: DataView): VisualSettings {

        let settings = <VisualSettings>VisualSettings.parse(dataView);
        if ("objects" in dataView.metadata && "constantLine" in dataView.metadata.objects) {
            let objects = dataView.metadata.objects;

            settings.constantLine.show = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "show" }, settings.constantLine.show || false);
            settings.constantLine.displayName = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "displayName" }, settings.constantLine.displayName || "Constant line");
            settings.constantLine.lineColor = dataViewObjects.getFillColor(objects, { objectName: "constantLine", propertyName: "lineColor" }, settings.constantLine.lineColor || "black");
            settings.constantLine.strokeWidth = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "strokeWidth" }, settings.constantLine.strokeWidth || 2);
            settings.constantLine.value = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "value" }, settings.constantLine.value || 0);
            settings.constantLine.lineStyle = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "lineStyle" }, settings.constantLine.lineStyle || LineStyle.solid);

        }

        return settings;
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {

        const settings = this.viewModel && this.viewModel.settings;
        const instanceEnumeration: VisualObjectInstanceEnumeration =
            VisualSettings.enumerateObjectInstances(settings, options);

        if (options.objectName === "constantLine") {
            this.enumerateConstantLine(instanceEnumeration)
        }
        console.log("enumerateObjectInstances: ");
        console.log(VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options))
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }

    private enumerateConstantLine(instanceEnumeration: VisualObjectInstanceEnumeration): VisualObjectInstance[] {
        let objectEnumeration: VisualObjectInstance[] = [];

        if (!(<VisualObjectInstanceEnumerationObject>instanceEnumeration).instances) {
            return;
        }

        const instance = {
            objectName: "Constant line",
            properties: {
                show: this.settings.constantLine.show,
                displayName: this.settings.constantLine.displayName,
                lineColor: this.settings.constantLine.lineColor,
                strokeWidth: this.settings.constantLine.strokeWidth,
                lineStyle: this.settings.constantLine.lineStyle
            },
            selector: null
        };
        this.addAnInstanceToEnumeration(instanceEnumeration, instance);

        return <VisualObjectInstance[]>objectEnumeration;
    }

    private init(options: VisualConstructorOptions) {
        this.viewModel = null;
        this.host = options.host;
        this.createViewport(options.element);
    }

    private createViewport(element: HTMLElement) {

        this.visualDiv = d3.select(element).append("div")

        this.svgContainer = this.visualDiv.append("svg");

    }

    private clearViewport() {

        this.svgContainer.selectAll("*").remove();

    }

    private static converter(
        dataView: DataView,
        host: IVisualHost,
        settings: VisualSettings,
    ): ViewModel {

        try {
            console.log("dataView: ");
            console.log(dataView);
            if (!dataView
                || !dataView.categorical
                || dataView.categorical.categories.length === 0) {
                return null;
            }



            const isCategoryFilled: boolean = dataRoleHelper.hasRoleInDataView(dataView, "category");
            const isValuesFilled: boolean = dataRoleHelper.hasRoleInDataView(dataView, "values");

            let dataPoints: DataPoint[] = [];
            let dataMax: number = null;

            if (!isCategoryFilled || !isValuesFilled) {
                return null;
            }

            if (isCategoryFilled && isValuesFilled) {
                let categorical = dataView.categorical;
                let category = categorical.categories[0];
                let dataValue = categorical.values[0];

                for (let i = 0, len = d3.max([category.values.length, dataValue.values.length]); i < len; i++) {
                    dataPoints.push({
                        value: dataValue.values[i],
                        category: `${category.values[i]}`,
                    });
                }

                dataMax = <number>dataValue.maxLocal
            }

            return {
                dataView,
                dataPoints,
                dataMax,
                settings,
                isCategoryFilled,
                isValuesFilled,
            };
        } catch (e) {
            console.log(e);
        }
    }

    private addAnInstanceToEnumeration(
        instanceEnumeration: VisualObjectInstanceEnumeration,
        instance: VisualObjectInstance): void {

        if ((<VisualObjectInstanceEnumerationObject>instanceEnumeration).instances) {
            (<VisualObjectInstanceEnumerationObject>instanceEnumeration)
                .instances
                .push(instance);
        } else {
            (<VisualObjectInstance[]>instanceEnumeration).push(instance);
        }
    }

    private renderVisual(options: VisualUpdateOptions) {

        const width = options.viewport.width;
        const height = options.viewport.height;



        const margin: margin = {
            top: 10,
            right: 10,
            bottom: 40,
            left: 75
        }
        this.svgContainer
            .attr("class", "visual-svg-container")
            .attr("viewBox", "0 0 " + width + " " + height)
            .attr("width", width)
            .attr("height", height);

        this.clearViewport();

        const data = this.viewModel.dataPoints;
        console.log("data: ");
        console.log(data);
        let yScale = d3.scaleLinear()
            .domain([0, this.viewModel.dataMax]).nice()
            .range([(height - (margin.top + margin.bottom)), margin.bottom]);

        let xScale = d3.scaleBand()
            .domain(data.map(d => d.category))
            .rangeRound([0, width - (margin.left + margin.right)])
            .padding(0.2);

        this.renderXAxis(this.svgContainer, xScale, width, height, margin);
        this.renderYAxis(this.svgContainer, yScale, data, width, height, margin);

        console.log("yScale(0): " + yScale(0));
        console.log("yScale(90.000): " + yScale(90000));

        this.renderBars(this.svgContainer, data, xScale, yScale, width, height, margin);

        this.svgContainer.append("g")
            .attr("class", "constant-line")
            .attr("transform", `translate(${margin.left},${(margin.top)})`)

        const dataView = this.viewModel.dataView;
        if ("objects" in dataView.metadata) {
            const objects: DataViewObjects = dataView.metadata.objects;
            this.renderConstantLine(this.svgContainer, objects, xScale, yScale, width, height, margin);
        }
    }

    private renderXAxis(container: Selection<any>, xScale: d3.ScaleBand<string>, width: number, height: number, margin: margin) {
        container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(${margin.left},${(height - (margin.bottom))})`)
            .attr("stroke", "#333")
            .attr("stroke-width", "0")
            .style("font-size", "9pt")
            .style("font-family", "Arial")
            .style("color", "#333")
            .call(d3.axisBottom(xScale));


    }

    private renderYAxis(container: Selection<any>, yScale: d3.ScaleLinear<number, number, never>, data: DataPoint[], width: number, height: number, margin: margin) {
        container.append("g")
            .attr("class", "y-axis")
            .attr("transform", `translate(${margin.left},${(margin.top)})`)
            .attr("stroke", "#333")
            .attr("stroke-width", "0")
            .style("font-size", "9pt")
            .style("font-family", "Arial")
            .style("color", "#333")
            .call(d3.axisLeft(yScale))
            .call(g => g.select(".domain").remove());
    }

    private renderBars(container: Selection<any>, data: DataPoint[], xScale: d3.ScaleBand<string>, yScale: d3.ScaleLinear<number, number, never>, width: number, height: number, margin: margin) {
        container.append("g")
            .attr("class", "data-bars")
            .attr("transform", `translate(${margin.left},${(margin.top)})`)
            .attr("fill", this.settings.dataPoint.defaultColor)
            .selectAll("rect")
            .data(data)
            .join("rect")
            .attr("x", (d, i) => xScale(d.category))
            .attr("y", d => yScale(<number>d.value))
            .attr("height", d => yScale(0) - yScale(<number>d.value))
            .attr("width", 1 * xScale.bandwidth());
    }


    private renderConstantLine(container: Selection<any>, objects: DataViewObjects, xScale: d3.ScaleBand<string>, yScale: d3.ScaleLinear<number, number, never>, width: number, height: number, margin: margin) {

        if ("constantLine" in objects) {
            const show: boolean = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "show" }, false);
            const lineColor: string = dataViewObjects.getFillColor(objects, { objectName: "constantLine", propertyName: "lineColor" }, "black");
            const strokeWidth: number = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "strokeWidth" }, 2);
            const value: number = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "value" }, 0);
            const lineStyle = dataViewObjects.getValue(objects, { objectName: "constantLine", propertyName: "lineStyle" }, LineStyle.solid);

            const dashArray: string = lineStyle === LineStyle.solid ? "5 0" : lineStyle === LineStyle.dashed ? "8 4" : "1 5";

            const cl = container.select(".constant-line");
            cl.selectAll("*").remove();

            if (show) {
                cl.append("line")
                    .attr("stroke-width", strokeWidth)
                    .attr("stroke", lineColor)
                    .attr("stroke-dasharray", dashArray)
                    .attr("x1", 0)
                    .attr("y1", yScale(value))
                    .attr("x2", width - margin.right)
                    .attr("y2", yScale(value));
            }
        }
    }
}