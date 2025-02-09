import "core-js/stable/array/from";
import "core-js/stable/array/fill";
import "core-js/stable/array/iterator";
import "core-js/stable/promise";
import "core-js/stable/reflect";
import "es6-map/implement";
//import "core-js/stable/symbol";
import "whatwg-fetch";

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version, DisplayMode } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
import { SPComponentLoader } from '@microsoft/sp-loader';
import { IPropertyPaneConfiguration, PropertyPaneButton, PropertyPaneButtonType, PropertyPaneCheckbox, PropertyPaneLabel, PropertyPaneLink, PropertyPaneTextField, PropertyPaneToggle, PropertyPaneChoiceGroup, IPropertyPaneGroup } from "@microsoft/sp-property-pane";
import { PropertyFieldSwatchColorPicker, PropertyFieldSwatchColorPickerStyle } from '@pnp/spfx-property-controls/lib/PropertyFieldSwatchColorPicker';
import { Logger, LogLevel, ConsoleListener } from "@pnp/logging";

import * as strings from 'hubLinksStrings';
import HubLinks from './components/HubLinks';
import { IHubLinksItem, HubLinksItem, HubLinksItemHeading, IHubLinksGroupItem, HubLinksGroupItem } from './components/IHubLinksItem';
import { HubLinksLayout } from './components/layouts/HubLinksLayout';
import { IHubLinksProps } from './components/HubLinks';
import { PropertyFieldCamlQueryFieldMapping, SPFieldType, SPFieldRequiredLevel, PropertyFieldCamlQueryOrderBy } from '../../propertyPane/propertyFieldCamlQueryFieldMapping/PropertyFieldCamlQueryFieldMapping';
import { PropertyPaneGroupSort } from '../../propertyPane/propertyFieldGroupSort/PropertyFieldGroupSort';
import { sp } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import QueryStringParser from "../../utilities/urlparser/queryStringParser";
import { WebPartLogger } from '../../utilities/webpartlogger/usagelogger';

const titleField = "Title";
const urlField = "URL";
const iconField = "Icon";
const groupingField = "GroupBy";
const descriptionField = "Description";
const openNewTabField = "NewTab";

export interface IHubLinksWebPartProps {
  listQuery: string;  //advancedCAMLQuery
  data: string;  //advancedCAMLData
  title: string;
  defaultExpand: boolean;
  hubLinksItems: IHubLinksItem[];
  usesListMode: boolean;
  layoutMode: HubLinksLayout;
  groups: string[];  //For Group Layout, list of groups identified with sort order
  showDescription: boolean;
  version: string;
  tileColor: string;
  tileColorProp: string;
  tileBorderColor: string;
  tileBorderColorProp: string;
  tileBackgroundColor: string;
  tileBackgroundColorProp: string;
}

export default class HubLinksWebPart extends BaseClientSideWebPart<IHubLinksWebPartProps> {
  private LOG_SOURCE = "HubLinksWebPart";

  private _webpart: any;
  private _activeIndex: number = -1;
  private _itemPropertyPane: boolean = false;

  constructor() {
    super();
  }

  public async onInit(): Promise<void> {
    //Initialize PnPLogger
    Logger.subscribe(new ConsoleListener());
    Logger.activeLogLevel = LogLevel.Info;

    try {
      //Initialize PnPJs
      let ie11Mode: boolean = (!!window.MSInputMethodContext && !!document["documentMode"]);
      sp.setup({ ie11: ie11Mode, spfxContext: this.context });

      SPComponentLoader.loadCss('https://use.fontawesome.com/releases/v5.14.0/css/all.css');

      const urls: string[] = [];
      if (this.properties.data) {
        this.properties.hubLinksItems.forEach(element => {
          if (element.URL)
            urls.push(element.URL);
        });
      }

      //Change theme colors of web part to expected values
      if (!this.properties.tileColorProp) this.properties.tileColorProp = "primaryText";
      if (!this.properties.tileColor) this.properties.tileColor = window["__themeState__"]["theme"][this.properties.tileColorProp];
      else if (this.properties.tileColor !== window["__themeState__"]["theme"][this.properties.tileColorProp]) this.properties.tileColor = window["__themeState__"]["theme"][this.properties.tileColorProp];

      if (!this.properties.tileBorderColorProp) this.properties.tileBorderColorProp = "themePrimary";
      if (!this.properties.tileBorderColor) this.properties.tileBorderColor = window["__themeState__"]["theme"][this.properties.tileBorderColorProp];
      else if (this.properties.tileBorderColor !== window["__themeState__"]["theme"][this.properties.tileBorderColorProp]) this.properties.tileBorderColor = window["__themeState__"]["theme"][this.properties.tileBorderColorProp];

      if (!this.properties.tileBackgroundColorProp) this.properties.tileBackgroundColorProp = "white";
      if (!this.properties.tileBackgroundColor) this.properties.tileBackgroundColor = window["__themeState__"]["theme"][this.properties.tileBackgroundColorProp];
      else if (this.properties.tileBackgroundColor !== window["__themeState__"]["theme"][this.properties.tileBackgroundColorProp]) this.properties.tileBackgroundColor = window["__themeState__"]["theme"][this.properties.tileBackgroundColorProp];

      if (this.displayMode !== DisplayMode.Edit)
        WebPartLogger.logUsage(this.context, urls);
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (onInit)`, LogLevel.Error);
    }
  }

  public get webpart(): any {
    return this._webpart;
  }

  public get activeIndex(): number {
    return this._activeIndex;
  }
  public set activeIndex(v: number) {
    this._activeIndex = v;
  }

  private _groupItems(items: IHubLinksItem[], groups?: string[]): IHubLinksGroupItem[] {
    let retArray: Array<IHubLinksGroupItem> = [];

    try {
      let groupId: number = 1;

      if (groups) {
        //Group order defined
        groups.forEach(grp => {
          retArray.push(new HubLinksGroupItem(new HubLinksItemHeading(grp, groupId), []));
          groupId++;
        });
      }

      items.forEach((link, idx) => {
        link.index = idx.toString();
        const newLink: IHubLinksItem = JSON.parse(JSON.stringify(link));
        var newGroup = true;
        newLink[groupingField] = link[groupingField] ? link[groupingField] : "Ungrouped";
        retArray.forEach(propLink => {
          if (propLink.Heading.Title == newLink[groupingField]) {
            propLink.Links.push(newLink);
            newGroup = false;
          }
        });
        if (newGroup) {
          retArray.push(new HubLinksGroupItem(new HubLinksItemHeading(newLink[groupingField], groupId), [newLink]));
          groupId++;
        }
      });
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (groupItems)`, LogLevel.Error);
    }
    return retArray;
  }

  public render(): void {
    const self = this;

    try {
      this._checkUpdateProperties();

      const element: React.ReactElement<IHubLinksProps> = React.createElement(
        HubLinks,
        {
          defaultExpand: this.properties.defaultExpand,
          links: [],
          title: this.properties.title,
          setTitle: (title: string) => {
            self.properties.title = title;
          },
          isEdit: this.displayMode === DisplayMode.Edit,
          textColor: this.properties.tileColorProp,
          borderColor: this.properties.tileBorderColorProp,
          backgroundColor: this.properties.tileBackgroundColorProp,
          hubLinksItems: this.properties.hubLinksItems,
          usesListMode: this.properties.usesListMode,
          setUrl: (url: string, name: string) => {
            if (this.activeIndex === -1) {
              this.properties.hubLinksItems.push(new HubLinksItem(null, name, url, "", "", false, "")); //strings.TitlePlaceholder
              this.activeIndex = this.properties.hubLinksItems.length - 1;
            }

            var isDoc = false;
            const docExtensions = ["pdf", "xls", "xlsx", "doc", "docx", "ppt", "pptx", "pptm", "dot"];
            for (const ext of docExtensions) {
              if (url.indexOf(ext, url.length - ext.length) !== -1)
                isDoc = true;
            }

            self.properties.hubLinksItems[this.activeIndex].URL = url + (isDoc ? "?web=1" : "");
            self.properties.hubLinksItems[this.activeIndex].Title = name ? name : this.properties.hubLinksItems[this.activeIndex].Title;
            if (!this.context.propertyPane.isRenderedByWebPart())
              this.context.propertyPane.open();
            self.context.propertyPane.refresh();
          },
          editItem: (index: number) => {
            if (index === -1) {
              this.properties.hubLinksItems.push(new HubLinksItem(null, "")); //strings.TitlePlaceholder
              index = this.properties.hubLinksItems.length - 1;
            }
            this.activeIndex = index;
            this.context.propertyPane.open();
          },
          deleteItem: (index: number) => {
            this.properties.hubLinksItems.splice(index, 1);
            this.render();
          },
          rearrangeItems: (newOrder: [number]) => {
            const newArr = new Array<HubLinksItem>();
            const currArr = this.properties.hubLinksItems;
            for (const num of newOrder)
              newArr.push(this.properties.hubLinksItems[num]);
            this.properties.hubLinksItems.length = 0;
            for (const val of newArr)
              this.properties.hubLinksItems.push(val);
          },
          setGroup: (index: string, group: string) => {
            for (var i = 0; i < this.properties.hubLinksItems.length; i++) {
              if (this.properties.hubLinksItems[i].index == index)
                this.properties.hubLinksItems[i].GroupBy = group;
            }
          },
          resetActiveIndex: () => {
            this.activeIndex = -1;
          },
          advancedCamlData: this.properties.data,
          context: this.context,
          layoutMode: this.properties.layoutMode,
          showDescription: this.properties.showDescription
        }
      );

      if (this.properties.usesListMode) {
        const propData = this.properties.data ? JSON.parse(this.properties.data) : { fieldMappings: [], selectedList: {} };
        if (propData.selectedList.id) {
          sp.web.lists.getById(propData.selectedList.id).getItemsByCAMLQuery({ ViewXml: QueryStringParser.ReplaceQueryStringParameters(this.properties.listQuery) }).then((response: any[]) => {
            response.forEach(value => {
              const item: any = {};
              propData.fieldMappings.forEach(mapping => {
                switch (mapping.type) {
                  case SPFieldType.URL:
                    item[mapping.name] = value[mapping.mappedTo] ? value[mapping.mappedTo]["Url"] : null;
                    item[mapping.name + "_text"] = value[mapping.mappedTo] ? value[mapping.mappedTo]["Description"] : null;
                    break;
                  default:
                    item[mapping.name] = value[mapping.mappedTo];
                    break;
                }
              });
              if (item[urlField] !== null) {
                //If has GroupBy field, then make sure it exists on groups property
                if (item.GroupBy && this.properties.groups.indexOf(item.GroupBy) < 0) {
                  //Group not in list, add
                  this.properties.groups.push(item.GroupBy);
                }
                element.props.links.push(new HubLinksItem(null, item[urlField + "_text"] === item[urlField] ? item.Title : item[urlField + "_text"], item.URL, item.Description, item.Icon, item.NewTab, item.GroupBy));
              }
            });

            if (this.properties.layoutMode == HubLinksLayout.GroupedListLayout) {
              //If group layout, then reform the links into a grouped format
              element.props.links = this._groupItems(element.props.links, this.properties.groups);
              //Refresh property pane if visible
              this.context.propertyPane.refresh();
            }

            this._webpart = ReactDom.render(element, this.domElement);
          }).catch((error) => { });
        }
      }
      else {
        //If group layout, then reform the links into a grouped format
        if (this.properties.layoutMode == HubLinksLayout.GroupedListLayout) {
          element.props.hubLinksItems = this._groupItems(this.properties.hubLinksItems, this.properties.groups);
        }
        this._webpart = ReactDom.render(element, this.domElement);
      }
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (groupItems)`, LogLevel.Error);
      return null;
    }
  }

  private _checkUpdateProperties(): void {
    try {
      if (this.properties.version != this.dataVersion.toString()) {
        const dataObj = this.properties.data ? JSON.parse(this.properties.data) :
          {
            filter: [],
            max: 0,
            selectedList: {},
            sort: {},
            fieldMappings: [],
            data: {}
          };
        let groupEnabled: boolean;
        if (dataObj.fieldMappings && dataObj.fieldMappings.length > 0) {
          groupEnabled = dataObj.fieldMappings.filter((item) => { return item.name === "Group By"; })[0].enabled;
        }
        dataObj.fieldMappings = [
          { name: urlField, type: SPFieldType.URL, enabled: true, requiredLevel: SPFieldRequiredLevel.Required, mappedTo: dataObj.fieldMappings.filter((item) => { return item.name === "URL"; })[0].mappedTo },
          { name: iconField, type: SPFieldType.Text, enabled: true, requiredLevel: SPFieldRequiredLevel.Required, mappedTo: dataObj.fieldMappings.filter((item) => { return item.name === "Font Awesome Icon"; })[0].mappedTo },
          { name: groupingField, type: SPFieldType.Text, enabled: true, requiredLevel: SPFieldRequiredLevel.Required, mappedTo: dataObj.fieldMappings.filter((item) => { return item.name === "Group By"; })[0].mappedTo },
          { name: descriptionField, type: SPFieldType.Text, enabled: true, requiredLevel: SPFieldRequiredLevel.Required },
          { name: titleField, type: SPFieldType.Text, enabled: true, requiredLevel: SPFieldRequiredLevel.Required, mappedTo: "Title" },
        ];
        this.properties.layoutMode = groupEnabled ? HubLinksLayout.GroupedListLayout : HubLinksLayout.ListLayout;
        this.properties.usesListMode = true;
        this.properties.showDescription = false;
        this.properties.groups = [];
        this.properties.hubLinksItems = [];
        this.properties.version = this.dataVersion.toString();
        this.properties.data = JSON.stringify(dataObj);
      }
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (checkUpdateProperties)`, LogLevel.Error);
    }
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  public openLinkSelector(event) {
    try {
      let currentUrl: string = "";
      if (this.activeIndex >= 0 && this.properties.hubLinksItems[this.activeIndex] && this.properties.hubLinksItems[this.activeIndex].URL) {
        currentUrl = this.properties.hubLinksItems[this.activeIndex].URL;
      }
      //open the link picker, sending in the current url for reference
      this.webpart.openLinkPicker(event, currentUrl);
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (openLinkSelector)`, LogLevel.Error);
    }
  }

  public itemValidation(length: number, required: boolean, errorText: string, value: string): Promise<string> {
    return new Promise<string>((resolve: (validationMessage: string) => void) => {
      if (value.length > length) {
        resolve(errorText);
      }
      else if (required && value.length < 1) {
        resolve(strings.RequiredValueErrorText);
      }
      else {
        resolve("");
      }
    });
  }

  private _updateGroupsProperty(): void {
    let groups: string[] = [];
    try {
      for (let i = 0; i < this.properties.hubLinksItems.length; i++) {
        let groupName: string = (this.properties.hubLinksItems[i].GroupBy?.length > 0) ? this.properties.hubLinksItems[i].GroupBy : "Ungrouped";
        let found: boolean = groups.indexOf(groupName) > -1;
        if (!found)
          groups.push(groupName);
      }
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (_updateGroupsProperty) -- Error processing property field changes.`, LogLevel.Error);
    }
    this.properties.groups = groups;
  }

  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: any, newValue: any): void {
    try {
      const pathIdx = propertyPath.indexOf('.');
      if (propertyPath.substring(pathIdx + 1) === "usesListMode" || propertyPath.substring(pathIdx + 1) == "listQuery") {
        //Reset grouping
        this.properties.groups = [];
        super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      } else if (propertyPath.substring(pathIdx + 1) === "GroupBy") {
        if (oldValue != newValue) {
          super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
          this._updateGroupsProperty();
        }
      } else if (propertyPath === "tileColor") {
        this.properties.tileColorProp = this.getThemeProperty(newValue);
        super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      } else if (propertyPath === "tileBorderColor") {
        this.properties.tileBorderColorProp = this.getThemeProperty(newValue);
        super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      } else if (propertyPath === "tileBackgroundColor") {
        this.properties.tileBackgroundColorProp = this.getThemeProperty(newValue);
        super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      } else {
        //super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
      }
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (onPropertyPaneFieldChanged)`, LogLevel.Error);
    }
  }

  public getThemeProperty(color: string) {
    const themePrimary = "themePrimary";
    const themePrimaryColor = window["__themeState__"]["theme"][themePrimary];

    const themeSecondary = "themeSecondary";
    const themeSecondaryColor = window["__themeState__"]["theme"][themeSecondary];

    const themeTertiary = "themeTertiary";
    const themeTertiaryColor = window["__themeState__"]["theme"][themeTertiary];

    const primaryText = "primaryText";
    const primaryTextColor = window["__themeState__"]["theme"][primaryText];

    const white = "white";
    const whiteColor = window["__themeState__"]["theme"][white];

    const black = "black";
    const blackColor = window["__themeState__"]["theme"][black];

    switch (color) {
      case themePrimaryColor: return themePrimary;
      case themeSecondaryColor: return themeSecondary;
      case themeTertiaryColor: return themeTertiary;
      case primaryTextColor: return primaryText;
      case whiteColor: return white;
      case blackColor: return black;
      default: return black;
    }
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    if (this.context.propertyPane.isRenderedByWebPart()) return this.getEditItemPropertyPane();
    return this.getBasicPropertyPane();
  }

  public getBasicPropertyPane(): IPropertyPaneConfiguration {
    //Define base configuration
    const config: IPropertyPaneConfiguration = {
      pages: [
        {
          header: {
            description: ''
          },
          groups: [
            {
              groupName: strings.LayoutLabel,
              isCollapsed: false,
              groupFields: [
                PropertyPaneChoiceGroup("layoutMode", {
                  label: "",
                  options: [
                    {
                      checked: this.properties.layoutMode === HubLinksLayout.RoundIconItemLayout,
                      key: HubLinksLayout.RoundIconItemLayout,
                      iconProps: { officeFabricIconFontName: "BulletedList2" },
                      text: strings.ItemLayoutLabel
                    },
                    {
                      checked: this.properties.layoutMode === HubLinksLayout.ListLayout,
                      key: HubLinksLayout.ListLayout,
                      iconProps: { officeFabricIconFontName: "List" },
                      text: strings.ListLayoutLabel
                    },
                    {
                      checked: this.properties.layoutMode === HubLinksLayout.GroupedListLayout,
                      key: HubLinksLayout.GroupedListLayout,
                      iconProps: { officeFabricIconFontName: "GroupedList" },
                      text: strings.GroupedListLayoutLabel
                    },
                    {
                      checked: this.properties.layoutMode === HubLinksLayout.GroupedListLayout,
                      key: HubLinksLayout.TileLayout,
                      iconProps: { officeFabricIconFontName: "GroupedList" },
                      text: strings.IconTopLayoutLabel
                    },
                    {
                      checked: this.properties.layoutMode === HubLinksLayout.GroupedListLayout,
                      key: HubLinksLayout.SquareIconItemLayout,
                      iconProps: { officeFabricIconFontName: "GroupedList" },
                      text: strings.IconLeftLayoutLabel
                    }
                  ]
                })
              ]
            }
          ],
          displayGroupsAsAccordion: true
        }]
    };

    try {
      //Add alternate configurations based on layout
      switch (this.properties.layoutMode) {
        case HubLinksLayout.GroupedListLayout:
          //Add show description
          config.pages[0].groups[0]["groupFields"].push(
            PropertyPaneToggle('showDescription', {
              label: strings.ShowDescriptionLabel,
              onText: strings.OnLabel,
              offText: strings.OffLabel
            })
          );
          //Add groups expanded by default
          config.pages[0].groups[0]["groupFields"].push(
            PropertyPaneToggle('defaultExpand', {
              label: strings.ExpandDefaultLabel,
              onText: strings.OnLabel,
              offText: strings.OffLabel
            })
          );
          //Add Group Sort 
          config.pages[0].groups[0]["groupFields"].push(
            PropertyPaneGroupSort('groups', {
              label: strings.GroupSortLabel,
              initialValue: this.properties.groups,
              render: this.render.bind(this),
              onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
              properties: this.properties,
              disabled: false,
              onGetErrorMessage: null,
              deferredValidationTime: 0,
              key: 'webpartGroupSort'
            })
          );
          break;
        case HubLinksLayout.RoundIconItemLayout:
          break;
        case HubLinksLayout.SquareIconItemLayout:
        case HubLinksLayout.TileLayout:
          const colors = [
            { label: strings.ThemePrimaryColor, color: window["__themeState__"]["theme"]["themePrimary"] },
            { label: strings.ThemeSecondaryColor, color: window["__themeState__"]["theme"]["themeSecondary"] },
            { label: strings.ThemePrimaryColor, color: window["__themeState__"]["theme"]["themeTertiary"] },
            //primaryText no longer consistent
            //{label: strings.ThemePrimaryText, color: window["__themeState__"]["theme"]["primaryText"]},
            { label: strings.ThemePrimaryText, color: window["__themeState__"]["theme"]["bodyText"] },
            { label: strings.WhiteColor, color: window["__themeState__"]["theme"]["white"] },
            { label: strings.BlackColor, color: window["__themeState__"]["theme"]["black"] },
          ];

          config.pages[0].groups[0]["groupFields"].push(
            PropertyFieldSwatchColorPicker('tileColor', {
              label: strings.TileFontColorLabel,
              selectedColor: this.properties.tileColor,
              colors: colors,
              style: PropertyFieldSwatchColorPickerStyle.Full,
              onPropertyChange: this.onPropertyPaneFieldChanged,
              properties: this.properties,
              key: 'tileColorFieldId'
            })
          );
          config.pages[0].groups[0]["groupFields"].push(
            PropertyFieldSwatchColorPicker('tileBackgroundColor', {
              label: strings.TileBackgroundColorLabel,
              selectedColor: this.properties.tileBackgroundColor,
              colors: colors,
              style: PropertyFieldSwatchColorPickerStyle.Full,
              onPropertyChange: this.onPropertyPaneFieldChanged,
              properties: this.properties,
              key: 'tileBackgroundColorFieldId'
            })
          );
          config.pages[0].groups[0]["groupFields"].push(
            PropertyFieldSwatchColorPicker('tileBorderColor', {
              label: strings.TileBorderColorLabel,
              selectedColor: this.properties.tileBorderColor,
              colors: colors,
              style: PropertyFieldSwatchColorPickerStyle.Full,
              onPropertyChange: this.onPropertyPaneFieldChanged,
              properties: this.properties,
              key: 'tileBorderColorFieldId'
            })
          );
          break;
        default:
          //Add show description
          config.pages[0].groups[0]["groupFields"].push(
            PropertyPaneToggle('showDescription', {
              label: strings.ShowDescriptionLabel,
              onText: strings.OnLabel,
              offText: strings.OffLabel
            })
          );
          break;
      }

      //Add usesListMode
      config.pages[0].groups[0]["groupFields"].push(
        PropertyPaneToggle('usesListMode', {
          label: strings.AdvancedEnableListModeLabel,
          onText: strings.OnLabel,
          offText: strings.OffLabel
        })
      );
      config.pages[0].groups[0]["groupFields"].push(
        PropertyPaneLabel('listModeInfo', {
          text: strings.AdvancedEnableListModeInfo
        })
      );

      //If usesListMode, the add advanced list mode group
      if (this.properties.usesListMode) {
        //Build fieldMapping array.
        const fieldMappings: Array<any> = [
          { name: urlField, type: SPFieldType.URL, requiredLevel: SPFieldRequiredLevel.Required },
          { name: iconField, type: SPFieldType.Text, requiredLevel: SPFieldRequiredLevel.Required },
          { name: groupingField, type: SPFieldType.Text, requiredLevel: SPFieldRequiredLevel.Required },
          { name: titleField, type: SPFieldType.Text, requiredLevel: SPFieldRequiredLevel.Required },
          { name: openNewTabField, type: SPFieldType.Boolean, requiredLevel: SPFieldRequiredLevel.Required }
        ];
        //If showDescription then add mapping for description field.
        if (this.properties.layoutMode === HubLinksLayout.RoundIconItemLayout || this.properties.showDescription) {
          fieldMappings.push({ name: descriptionField, type: SPFieldType.Text, requiredLevel: SPFieldRequiredLevel.Required });
        }

        config.pages[0].groups.push(
          {
            groupName: strings.AdvancedListModeGroupLabel,
            isCollapsed: !this.properties.usesListMode,
            groupFields: [
              PropertyFieldCamlQueryFieldMapping('listQuery', {
                label: strings.ListQueryGroupName,
                dataPropertyPath: "data",
                query: this.properties.listQuery,
                fieldMappings: fieldMappings,
                createFields: [
                  '<Field Type="Text" DisplayName="LinkCategory" Required="FALSE" EnforceUniqueValues="FALSE" Indexed="FALSE" MaxLength="255" Group="Web Part Columns" ID="{0dfb4045-98b8-4bad-ac61-d9c42f67d262}" SourceID="{a5df0f41-264b-4bf8-a651-222fcdf5d32d}" StaticName="LinkCategory" Name="LinkCategory" Version="5" />',
                  '<Field ID="{c29e077d-f466-4d8e-8bbe-72b66c5f205c}" Name="URL" SourceID="http://schemas.microsoft.com/sharepoint/v3" StaticName="URL" Group="Base Columns" Type="URL" DisplayName="URL" Required="TRUE"/>',
                  '<Field Type="Text" DisplayName="FontAwesomeIcon" Required="FALSE" EnforceUniqueValues="FALSE" Indexed="FALSE" MaxLength="255" Group="Web Part Columns" ID="{6df0c002-e0f6-4801-aa83-b7a5bb80f0f4}" SourceID="{a5df0f41-264b-4bf8-a651-222fcdf5d32d}" StaticName="FontAwesomeIcon" Name="FontAwesomeIcon" Version="5" />',
                  '<Field Type="Number" DisplayName="SortOrder" Required="FALSE" EnforceUniqueValues="FALSE" Indexed="FALSE" Group="Web Part Columns" ID="{7a911a9e-dbe1-4a87-bd40-c042db929a80}" SourceID="{a5df0f41-264b-4bf8-a651-222fcdf5d32d}" StaticName="SortOrder" Name="SortOrder" Version="5" />',
                  '<Field Type="Text" DisplayName="Description" Required="FALSE" EnforceUniqueValues="FALSE" Indexed="FALSE" MaxLength="255" Group="Web Part Columns" ID="{7350f220-d480-4dd8-89a5-1fafd4cd7d23}" SourceID="{a5df0f41-264b-4bf8-a651-222fcdf5d32d}" StaticName="Description" Name="Description" Version="5" />',
                  '<Field Type="Boolean" DisplayName="OpenLinkinNewTab" Required="FALSE" EnforceUniqueValues="FALSE" Indexed="FALSE" Group="Web Part Columns" ID="{4bf7c60f-0737-49c9-894c-6a31af134242}" SourceID="{4bf7c60f-0737-49c9-894c-6a31af134242}" StaticName="OpenLinkInNewTab" Name="OpenLinkInNewTab" Version="5" />'
                ],
                createTitleRequired: false,
                includeHidden: false,
                orderBy: PropertyFieldCamlQueryOrderBy.Title,
                showOrderBy: true,
                showFilters: true,
                showMax: false,
                showCreate: true,
                render: this.render.bind(this),
                onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                context: this.context,
                properties: this.properties,
                disabled: false,
                onGetErrorMessage: null,
                deferredValidationTime: 0,
                key: 'spListQueryFieldId'
              })
            ]
          }
        );
      }
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (getBasicPropertyPane)`, LogLevel.Error);
    }

    return config;
  }

  public getEditItemPropertyPane(): IPropertyPaneConfiguration {
    let retVal: IPropertyPaneConfiguration = {
      pages: [
        {
          header: {
            description: ""
          },
          displayGroupsAsAccordion: true,
          groups: []
        }
      ]
    };

    try {
      let group0: IPropertyPaneGroup = {
        groupName: strings.EditItemGeneralLabel,
        groupFields: []
      };

      const titleLength: number = (80 - ((this.properties.hubLinksItems[this.activeIndex]?.Title) ? this.properties.hubLinksItems[this.activeIndex].Title.length : 0));
      group0.groupFields.push(PropertyPaneTextField(`hubLinksItems[${this.activeIndex}].Title`, {
        label: strings.EditItemGeneralTitleLabel,
        description: `${strings.EditItemGeneralTitlePreCountLabel} ${titleLength} ${strings.EditItemGeneralTitlePostCountLabel}`,
        //onGetErrorMessage: this.itemValidation.bind(this, 80, true, strings.EditItemGeneralTitleErrorText)
      }));

      const descriptionLength: number = (130 - ((this.properties.hubLinksItems[this.activeIndex]?.Description) ? this.properties.hubLinksItems[this.activeIndex].Description.length : 0));
      group0.groupFields.push(PropertyPaneTextField(`hubLinksItems[${this.activeIndex}].Description`, {
        label: strings.EditItemGeneralDescriptionLabel,
        description: `${strings.EditItemGeneralDescriptionPreCountLabel} ${descriptionLength} ${strings.EditItemGeneralDescriptionPostCountLabel}`,
        onGetErrorMessage: this.itemValidation.bind(this, 130, (this.properties.layoutMode === HubLinksLayout.RoundIconItemLayout || this.properties.showDescription), strings.EditItemGeneralDescriptionErrorText)
      }));

      const groupByLength: number = (80 - ((this.properties.hubLinksItems[this.activeIndex]?.GroupBy) ? this.properties.hubLinksItems[this.activeIndex].GroupBy.length : 0));
      group0.groupFields.push(PropertyPaneTextField(`hubLinksItems[${this.activeIndex}].GroupBy`, {
        label: strings.EditItemGeneralGroupByLabel,
        description: `${strings.EditItemGeneralGroupByPreCountLabel} ${groupByLength} ${strings.EditItemGeneralGroupByPostCountLabel}`,
        onGetErrorMessage: this.itemValidation.bind(this, 80, (this.properties.layoutMode === HubLinksLayout.GroupedListLayout), strings.EditItemGeneralGroupByErrorText)
      }));

      group0.groupFields = group0.groupFields.concat([
        PropertyPaneLabel("itemLinkLabel", {
          text: strings.EditItemGeneralSelectLinkLabel
        }),
        PropertyPaneLink(`hubLinksItems[${this.activeIndex}].URL`, {
          target: "_blank",
          href: this.properties.hubLinksItems[this.activeIndex]?.URL,
          text: this.properties.hubLinksItems[this.activeIndex]?.URL
        }),
        PropertyPaneButton("itemChangeLink", {
          text: strings.EditItemGeneralSelectLinkButtonText,
          buttonType: PropertyPaneButtonType.Primary,
          onClick: this.openLinkSelector.bind(this)
        }),
        PropertyPaneCheckbox(`hubLinksItems[${this.activeIndex}].NewTab`, {
          text: strings.EditItemGeneralOpenTabLabel
        })
      ]);

      retVal.pages[0].groups.push(group0);

      let group1: IPropertyPaneGroup = {
        groupName: strings.EditItemIconLabel,
        groupFields: [
          PropertyPaneTextField("hubLinksItems[" + this.activeIndex + "].Icon", {
            label: strings.EditItemIconEntryLabel,
            placeholder: strings.EditItemIconEntryPlaceholder,
            onGetErrorMessage: this.itemValidation.bind(this, 255, (this.properties.layoutMode === HubLinksLayout.RoundIconItemLayout), "")
          }),
          PropertyPaneLink('iconShortcut', {
            text: strings.EditItemIconEntryLinkText,
            href: "https://fontawesome.com/icons?d=gallery&m=free",
            target: "_blank"
          })
        ]
      };
      retVal.pages[0].groups.push(group1);
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (getEditItemPropertyPane)`, LogLevel.Error);
    }
    return retVal;
  }

  protected onPropertyPaneConfigurationComplete(): void {
    let hubLinksItems: IHubLinksItem[] = [];
    try {
      for (let i = 0; i < this.properties.hubLinksItems.length; i++) {
        if (this.properties.hubLinksItems[i].Title?.length > 0)
          hubLinksItems.push(this.properties.hubLinksItems[i]);
      }

      //Update groups and render
      this._updateGroupsProperty();
      this.properties.hubLinksItems = hubLinksItems;
      this.render();
    } catch (err) {
      Logger.write(`${err} - ${this.LOG_SOURCE} (onPropertyPaneConfigurationComplete)`, LogLevel.Error);
    }
  }
}
