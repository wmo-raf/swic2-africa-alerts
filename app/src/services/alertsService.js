import axios from "axios";
import moment from "moment";
import GeoJSONPolyline from "geojson-polyline";
import geojsonhint from "@mapbox/geojsonhint";
import booleanIntersects from "@turf/boolean-intersects";
import isEmpty from "lodash/isEmpty.js";
import slugify from "slugify";
import isPlainObject from "lodash/isPlainObject.js";
import * as txml from "txml";
import turfCircle from "@turf/circle";
import rewind from "@mapbox/geojson-rewind";

import africaGeojson from "./africa.js";
import alertSources from "./cap-sources.js";

const { all, spread, get } = axios;

const COUNTRIES_LIST = ["southAfrica", "algeria", "others"];

const CAP_DETAIL_URL_BASE =
  "https://8xieiqdnye.execute-api.us-west-2.amazonaws.com/prod/capURL";

function pad2(n) {
  return n < 10 ? "0" + n : n;
}

function chkByGeoJsonLint(in_link, in_json) {
  var valid = true;
  var testJson = JSON.stringify(in_json, null, 4);
  var errors = geojsonhint.hint(testJson);
  if (errors.length > 0) {
    if (errors[0].message.search(/right-hand rule/) == -1) {
      var message = errors
        .map(function (error) {
          return /*'Line ' + error.line + ': ' +*/ error.message;
        })
        .join("<br>");
      valid = false;
    }
  }
  return valid;
}

function getTheHighestSeverity(cap_set, coord_set) {
  let highest = 0;
  let tmpSeverity = 0;

  const link = [],
    severity = [],
    event = [],
    type = [],
    pastday = [],
    coord = [];

  for (let d = 0; d < cap_set.length; d++) {
    if (cap_set[d][1] == 1 && tmpSeverity < 1) {
      highest = d;
      tmpSeverity = 1;
    }
    if (cap_set[d][1] == 2 && tmpSeverity < 2) {
      highest = d;
      tmpSeverity = 2;
    }
    if (cap_set[d][1] == 3 && tmpSeverity < 3) {
      highest = d;
      tmpSeverity = 3;
    }
    if (cap_set[d][1] == 4 && tmpSeverity < 4) {
      highest = d;
      tmpSeverity = 4;
    }
    link.push(cap_set[d][0]);
    severity.push(cap_set[d][1]);
    event.push(cap_set[d][2]);
    type.push(cap_set[d][3]);
    pastday.push(cap_set[d][6]);
    coord.push(coord_set);
  }
  return [link, severity, event, type, highest, coord, pastday];
}

function validation(in_link, in_polygon) {
  let valid = true;
  for (let a = 0; a < in_polygon.length; a++) {
    for (let b = 0; b < in_polygon[a].length; b++) {
      const itm = in_polygon[a][b].split(",");
      if (
        Math.abs(parseFloat(itm[0])) > 180 ||
        Math.abs(parseFloat(itm[1])) > 180
      ) {
        console.log(in_link);
        console.log("Invalid lat/lng value");
        valid = false;
        break;
      }
    }
  }
  if (valid) {
    for (let i = 0; i < in_polygon.length; i++) {
      const arr_polygon = [];
      for (let j = 0; j < in_polygon[i].length; j++) {
        const tmp = in_polygon[i][j].split(",");
        tmp[0] = parseFloat(tmp[0]);
        tmp[1] = parseFloat(tmp[1]);
        arr_polygon.push([tmp[0], tmp[1]]);
      }
      const Polygon = {
        type: "Polygon",
        coordinates: [arr_polygon],
      };
      valid = chkByGeoJsonLint(in_link, Polygon);
      if (!valid) break;
    }
  }

  return valid;
}

function getUTC() {
  const d = new Date();

  const year = d.getUTCFullYear();
  const month = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hours = pad2(d.getUTCHours());
  const minutes = pad2(d.getUTCMinutes());
  const seconds = pad2(d.getUTCMinutes());

  const utc = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  return utc;
}

var checked = [],
  same = [],
  samePD = [],
  gotSame = [];

const getData = (jsonName, utc) => {
  const currentTime = moment().format("YYYYMMDDHHmmss");

  const url = `https://severeweather.wmo.int/v2/json/${jsonName}.json?${currentTime}`;

  return get(url).then((response) => {
    const data = response.data;

    if (!data.length) {
      return null;
    }

    const geocode_container = [];
    const poly_container = [];
    const geojson_container = [];
    const marker_container = [];
    const circle_container = [];

    checked[jsonName] = [];
    same[jsonName] = [];
    samePD[jsonName] = [];
    gotSame[jsonName] = [];

    const polygon_json = [];

    for (let i = 0; i < data.length; i++) {
      let show = false;
      let expires = data[i].expires;

      let linkType, dataLink;

      if (typeof data[i].url != "undefined") {
        linkType = "url";
        dataLink = data[i].url;
      } else {
        linkType = "capURL";
        dataLink = data[i].capURL;
      }

      const ele = dataLink.split("/").slice(-7);
      const sourceId = ele[0];

      let effective = data[i].sent;
      if (data[i].effective != "") {
        effective = data[i].effective;
      }
      if (data[i].onset != "") {
        effective = data[i].onset;
      }

      if (data[i].expires == "") {
        const twentyfour = new Date(effective);

        twentyfour.setHours(twentyfour.getHours() + 24);

        expires =
          twentyfour.getFullYear() +
          "-" +
          pad2(twentyfour.getMonth() + 1) +
          "-" +
          pad2(twentyfour.getDate()) +
          " " +
          pad2(twentyfour.getHours()) +
          ":" +
          pad2(twentyfour.getMinutes()) +
          ":" +
          pad2(twentyfour.getSeconds());

        if (utc <= expires) {
          show = true;
        }

        if (dataLink.search(/hk-hko-xx/) > -1) {
          show = true;
        }
      } else {
        if (utc < data[i].expires) {
          show = true;
        }

        if (data[i].expires < effective) {
          show = false;
        }
      }

      if (dataLink.search(/vu-vms-xx/) > -1) {
        show = false;
      }

      if (
        dataLink.search(/za-saws-en/) > -1 ||
        dataLink.search(/id-inatews-id/) > -1
      ) {
        show = true;
      }

      if (!show) {
        continue;
      }

      const datetime1 = moment(utc).format("YYYY-MM-DD HH:mm:ss");

      const endOfDatetime1 = moment(datetime1)
        .endOf("day")
        .format("YYYY-MM-DD HH:mm:ss");

      const effective1 = moment(effective).format("YYYY-MM-DD HH:mm:ss");

      const expires1 = moment(expires).format("YYYY-MM-DD HH:mm:ss");
      let past_day = 0;

      if (effective1 < endOfDatetime1 && expires1 > endOfDatetime1) {
        //case: cover today and tmr (calculation in UTC)
        past_day = 1;
      } else if (effective1 >= endOfDatetime1) {
        //case: tmr and later (calculation in UTC)
        past_day = 2;
      } else if (/*effective >= datetime1 || */ expires1 <= endOfDatetime1) {
        // case: today (calculation in UTC)
        past_day = 3;
      } else {
        // missing any case?
        console.log("past_day = 4");
        console.log(datetime1 + " to " + endOfDatetime1);
        console.log(effective1 + " to " + expires1);
      }

      for (let len = 0; len < data[i].coord.length; len++) {
        if (typeof data[i].coord[len].polygon != "undefined") {
          /**POLYGON**/
          if (
            validation(dataLink, data[i].coord[len].polygon) ||
            dataLink.search(/to-tms-en/) > -1
          ) {
            for (let a = 0; a < data[i].coord[len].polygon.length; a++) {
              const piece = [];
              piece.push(dataLink);
              piece.push(data[i].s);
              const desp = data[i].areaDesc
                ? data[i].areaDesc
                : data[i].description;
              const gc = data[i].gc ? "^" + data[i].gc : "";
              piece.push(
                data[i].event +
                  "^" +
                  desp +
                  "^" +
                  data[i].sent +
                  "^" +
                  data[i].mem +
                  gc
              );
              piece.push("polygon");
              piece.push(data[i].coord[len].polygon[a]);
              piece.push(data[i].coord[len].polygon);
              piece.push(data[i].u);
              piece.push(data[i].c);
              piece.push(past_day);
              if (typeof data[i].marine != "undefined")
                piece.push(data[i].marine);
              else piece.push("N");
              piece.push(jsonName);
              piece.push(data[i].rLink ? data[i].rLink : "");
              piece.push(linkType);
              piece.push(sourceId);

              poly_container.push(piece);
            }
          }
        }

        if (typeof data[i].coord[len].geocode != "undefined") {
          /**GEOCODE**/
          data[i].coord[len].geocode.forEach((dkey, dval) => {
            dval.forEach((k, v) => {
              try {
                const piece = [];
                piece.push(dataLink);
                piece.push(data[i].s);
                const desp = data[i].areaDesc
                  ? data[i].areaDesc
                  : data[i].description;
                const gc = data[i].gc ? "^" + data[i].gc : "";
                piece.push(
                  data[i].event +
                    "^" +
                    desp +
                    "^" +
                    data[i].sent +
                    "^" +
                    data[i].mem +
                    gc
                );
                piece.push("geocode");
                piece.push(v);
                piece.push(data[i].coord[len].geocode);
                piece.push(data[i].u);
                piece.push(data[i].c);
                piece.push(past_day);
                if (typeof data[i].marine != "undefined")
                  piece.push(data[i].marine);
                else piece.push("N");
                piece.push(jsonName);
                piece.push(data[i].rLink ? data[i].rLink : "");
                piece.push(linkType);
                piece.push(sourceId);
                geocode_container.push(piece);
              } catch (err) {
                console.log("CAP link: " + dataLink);
                console.log("cannot decode: " + v);
              }
            });
          });
        }

        if (typeof data[i].coord[len].geojson != "undefined") {
          /**GEOJSON**/
          data[i].coord[len].geojson.forEach((dkey, dval) => {
            const piece = [];
            piece.push(dataLink);
            piece.push(data[i].s);
            const desp = data[i].areaDesc
              ? data[i].areaDesc
              : data[i].description;
            const gc = data[i].gc ? "^" + data[i].gc : "";
            piece.push(
              data[i].event +
                "^" +
                desp +
                "^" +
                data[i].sent +
                "^" +
                data[i].mem +
                gc
            );
            piece.push("geojson");
            piece.push(dval);
            piece.push(data[i].coord[len].geojson);
            piece.push(data[i].u);
            piece.push(data[i].c);
            piece.push(past_day);
            if (typeof data[i].marine != "undefined")
              piece.push(data[i].marine);
            else piece.push("N");
            piece.push(jsonName);
            piece.push(data[i].rLink ? data[i].rLink : "");
            piece.push(linkType);
            piece.push(sourceId);
            geojson_container.push(piece);
          });
        }

        if (typeof data[i].coord[len].circle != "undefined") {
          /**CIRCLE**/
          const piece = [];
          piece.push(dataLink);
          piece.push(data[i].s);
          const desp = data[i].areaDesc
            ? data[i].areaDesc
            : data[i].description;
          const gc = data[i].gc ? "^" + data[i].gc : "";
          piece.push(
            data[i].event +
              "^" +
              desp +
              "^" +
              data[i].sent +
              "^" +
              data[i].mem +
              gc
          );
          piece.push("circle");
          piece.push(data[i].coord[len].circle[0][0]);
          piece.push(data[i].coord[len].circle[0][1]);
          piece.push(data[i].u);
          piece.push(data[i].c);
          piece.push(past_day);
          if (typeof data[i].marine != "undefined") piece.push(data[i].marine);
          else piece.push("N");
          piece.push(jsonName);
          piece.push(data[i].rLink ? data[i].rLink : "");
          piece.push(linkType);
          piece.push(sourceId);
          circle_container.push(piece);
        }

        if (typeof data[i].coord[len].marker != "undefined") {
          /**marker**/
          const piece = [];
          piece.push(dataLink);
          piece.push(data[i].s);
          const desp = data[i].areaDesc
            ? data[i].areaDesc
            : data[i].description;
          const gc = data[i].gc ? "^" + data[i].gc : "";
          piece.push(
            data[i].event +
              "^" +
              desp +
              "^" +
              data[i].sent +
              "^" +
              data[i].mem +
              gc
          );
          piece.push("marker");
          piece.push(data[i].coord[len].marker);
          piece.push(data[i].coord[len].marker);
          piece.push(data[i].u);
          piece.push(data[i].c);
          piece.push(past_day);
          if (typeof data[i].marine != "undefined") piece.push(data[i].marine);
          else piece.push("N");
          piece.push(jsonName);
          piece.push(data[i].rLink ? data[i].rLink : "");
          piece.push(linkType);
          piece.push(sourceId);

          marker_container.push(piece);
        }
      }
    }

    if (poly_container.length > 0) {
      /**POLYGON**/

      const outter = [];

      let chkkey1 = "";
      let chkkey2 = "";

      for (let a = 0; a < poly_container.length; a++) {
        let same_idx = -1;

        chkkey1 =
          poly_container[a][4].length +
          "_" +
          poly_container[a][4][0] +
          poly_container[a][4][1] +
          poly_container[a][4][poly_container[a][4].length - 2] +
          poly_container[a][4][poly_container[a][4].length - 1];

        if (checked[jsonName].indexOf(chkkey1) == -1) {
          checked[jsonName].push(chkkey1);
          for (let b = a + 1; b < poly_container.length; b++) {
            chkkey2 =
              poly_container[b][4].length +
              "_" +
              poly_container[b][4][0] +
              poly_container[b][4][1] +
              poly_container[b][4][poly_container[b][4].length - 2] +
              poly_container[b][4][poly_container[b][4].length - 1];
            if (chkkey1 == chkkey2) {
              same_idx = checked[jsonName].length - 1;
              same[jsonName][same_idx] = [poly_container[a][1]];
              samePD[jsonName][same_idx] = [poly_container[a][8]];
              break;
            }
          }
        } else {
          same_idx = checked[jsonName].indexOf(chkkey1);
          if (
            same_idx != -1 &&
            same[jsonName][same_idx].indexOf(poly_container[a][1]) == -1
          ) {
            same[jsonName][same_idx].push(poly_container[a][1]);
            samePD[jsonName][same_idx].push(poly_container[a][8]);
          }
        }

        const tank = [];
        const tmp = [];
        tmp.push(poly_container[a][0]);
        tmp.push(poly_container[a][1]);
        tmp.push(poly_container[a][2]);
        tmp.push(poly_container[a][3]);
        tmp.push(poly_container[a][6]);
        tmp.push(poly_container[a][7]);
        tmp.push(poly_container[a][8]);
        tmp.push(same_idx);
        tmp.push(poly_container[a][9]); //marine
        tmp.push(poly_container[a][10]); //jsonName
        tmp.push(poly_container[a][11]); //rLink
        tmp.push(poly_container[a][12]); //linkType
        tmp.push(poly_container[a][13]); //sourceId
        tank.push(tmp);

        const each = [];
        each.push(tank);
        each.push(poly_container[a][4]);
        each.push(poly_container[a][5]);
        outter.push(each);
      }

      for (let p = 0; p < outter.length; p++) {
        const tmpCList = [];
        for (let j = 0; j < outter[p][1].length; j++) {
          if (outter[p][1][j] != "") {
            let tmpC = outter[p][1][j].split(",");
            if (
              /*outter[p][0][0][0].search(/ie-met-en/) > -1 || */ outter[
                p
              ][0][0][0].search(/si-meteo-xx/) > -1 &&
              parseFloat(tmpC[0]) < parseFloat(tmpC[1])
            ) {
              tmpC[1] = parseFloat(tmpC[1]);
              tmpC[0] = parseFloat(tmpC[0]);
            } else {
              const tmp = tmpC[1];
              tmpC[1] = parseFloat(tmpC[0]);
              tmpC[0] = parseFloat(tmp);
            }
            tmpCList.push(tmpC);
          }
        }

        const ret = getTheHighestSeverity(outter[p][0], outter[p][2]);

        var tmp_polygon = {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [tmpCList],
          },
          properties: {
            link: outter[p][0][ret[4]][0],
            type: "polygon",
            severity: outter[p][0][ret[4]][1],
            urgency: outter[p][0][ret[4]][4],
            certainty: outter[p][0][ret[4]][5],
            pastday: outter[p][0][ret[4]][6],
            event: outter[p][0][ret[4]][2],
            // coord: outter[p][2],
            // lists: ret,
            same: outter[p][0][ret[4]][7],
            marine: outter[p][0][ret[4]][8],
            jsonName: outter[p][0][ret[4]][9],
            rLink: outter[p][0][ret[4]][10],
            linkType: outter[p][0][ret[4]][11],
            sourceId: outter[p][0][ret[4]][12],
            utc: utc,
          },
        };

        polygon_json.push(tmp_polygon);
      }
    }

    if (geocode_container.length > 0) {
      /**GEOCODE**/
      const outter = [];

      let chkkey1 = "";
      let chkkey2 = "";

      for (let a = 0; a < geocode_container.length; a++) {
        let same_idx = -1;

        if (
          geocode_container[a][4].type != "MultiPolygon" &&
          geocode_container[a][4].type != "Polygon"
        ) {
          continue;
        }

        if (geocode_container[a][4].type == "MultiPolygon") {
          chkkey1 = geocode_container[a][4].coordinates[0][0];
          if (geocode_container[a][4].coordinates.length > 1) {
            chkkey1 = chkkey1 + geocode_container[a][4].coordinates[1][0];
          }
        }
        if (geocode_container[a][4].type == "Polygon") {
          chkkey1 = geocode_container[a][4].coordinates[0];
        }
        if (checked[jsonName].indexOf(chkkey1) == -1) {
          checked[jsonName].push(chkkey1);
          for (let b = a + 1; b < geocode_container.length; b++) {
            if (geocode_container[b][4].type == "MultiPolygon") {
              chkkey2 = geocode_container[b][4].coordinates[0][0];
              if (geocode_container[b][4].coordinates.length > 1) {
                chkkey2 = chkkey2 + geocode_container[b][4].coordinates[1][0];
              }
            }
            if (geocode_container[b][4].type == "Polygon") {
              chkkey2 = geocode_container[b][4].coordinates[0];
            }
            if (chkkey1 == chkkey2) {
              same_idx = checked[jsonName].length - 1;
              same[jsonName][same_idx] = [geocode_container[a][1]];
              samePD[jsonName][same_idx] = [geocode_container[a][8]];
              break;
            }
          }
        } else {
          same_idx = checked[jsonName].indexOf(chkkey1);
          if (
            same_idx != -1 &&
            same[jsonName][same_idx].indexOf(geocode_container[a][1]) == -1
          ) {
            same[jsonName][same_idx].push(geocode_container[a][1]);
            samePD[jsonName][same_idx].push(geocode_container[a][8]);
          }
        }

        const tank = [];
        const tmp = [];
        tmp.push(geocode_container[a][0]);
        tmp.push(geocode_container[a][1]);
        tmp.push(geocode_container[a][2]);
        tmp.push(geocode_container[a][3]);
        tmp.push(geocode_container[a][6]);
        tmp.push(geocode_container[a][7]);
        tmp.push(geocode_container[a][8]);
        tmp.push(same_idx);
        tmp.push(geocode_container[a][9]); //marine
        tmp.push(geocode_container[a][10]); //jsonName
        tmp.push(geocode_container[a][11]); //rLink
        tmp.push(geocode_container[a][12]); //linkType
        tmp.push(geocode_container[a][13]); //sourceId
        tank.push(tmp);

        const each = [];
        each.push(tank);
        each.push(geocode_container[a][4]);
        each.push(geocode_container[a][5]);
        outter.push(each);
      }

      for (let p = 0; p < outter.length; p++) {
        const polygon = outter[p][1];
        const encoded = [];
        encoded[0] = polygon;
        const decoded = encoded.map(GeoJSONPolyline.decode);

        const ret = getTheHighestSeverity(outter[p][0], outter[p][2]);

        const tmp_polygon = {
          type: "Feature",
          geometry: {
            type: decoded[0]["type"],
            coordinates: decoded[0]["coordinates"],
          },
          properties: {
            link: outter[p][0][ret[4]][0],
            type: "geocode",
            severity: outter[p][0][ret[4]][1],
            urgency: outter[p][0][ret[4]][4],
            certainty: outter[p][0][ret[4]][5],
            pastday: outter[p][0][ret[4]][6],
            event: outter[p][0][ret[4]][2],
            // coord: JSON.stringify(outter[p][2]),
            // lists: ret,
            same: outter[p][0][ret[4]][7],
            marine: outter[p][0][ret[4]][8],
            jsonName: outter[p][0][ret[4]][9],
            rLink: outter[p][0][ret[4]][10],
            linkType: outter[p][0][ret[4]][11],
            sourceId: outter[p][0][ret[4]][12],
            utc: utc,
          },
        };

        polygon_json.push(tmp_polygon);
      }
    }

    if (geojson_container.length > 0) {
      /**GEOJSON**/ //var checked = [];
      const outter = [];
      let chkkey1 = "";
      let chkkey2 = "";

      for (let a = 0; a < geojson_container.length; a++) {
        let same_idx = -1;

        const coord = geojson_container[a][4].coordinates[0];
        chkkey1 =
          coord[0][0] +
          "," +
          coord[0][1] +
          coord[coord.length - 2][0] +
          "," +
          coord[coord.length - 2][1] +
          coord[coord.length - 1][0] +
          "," +
          coord[coord.length - 1][1];
        if (checked[jsonName].indexOf(chkkey1) == -1) {
          checked[jsonName].push(chkkey1);
          for (let b = a + 1; b < geojson_container.length; b++) {
            const coord = geojson_container[b][4].coordinates[0];
            chkkey2 =
              coord[0][0] +
              "," +
              coord[0][1] +
              coord[coord.length - 2][0] +
              "," +
              coord[coord.length - 2][1] +
              coord[coord.length - 1][0] +
              "," +
              coord[coord.length - 1][1];
            if (chkkey1 == chkkey2) {
              same_idx = checked[jsonName].length - 1;
              same[jsonName][same_idx] = [geojson_container[a][1]];
              samePD[jsonName][same_idx] = [geojson_container[a][8]];
              break;
            }
          }
        } else {
          same_idx = checked[jsonName].indexOf(chkkey1);
          if (
            same_idx != -1 &&
            same[jsonName][same_idx].indexOf(geojson_container[a][1]) == -1
          ) {
            same[jsonName][same_idx].push(geojson_container[a][1]);
            samePD[jsonName][same_idx].push(geojson_container[a][8]);
          }
        }

        const tank = [];
        const tmp = [];
        tmp.push(geojson_container[a][0]);
        tmp.push(geojson_container[a][1]);
        tmp.push(geojson_container[a][2]);
        tmp.push(geojson_container[a][3]);
        tmp.push(geojson_container[a][6]);
        tmp.push(geojson_container[a][7]);
        tmp.push(geojson_container[a][8]);
        tmp.push(same_idx);
        tmp.push(geojson_container[a][9]); //marine
        tmp.push(geojson_container[a][10]); //jsonName
        tmp.push(geojson_container[a][11]); //rLink
        tmp.push(geojson_container[a][12]); //linkType
        tmp.push(geojson_container[a][13]); //sourceId
        tank.push(tmp);

        const each = [];
        each.push(tank);
        each.push(geojson_container[a][4]);
        each.push(geojson_container[a][5]);
        outter.push(each);
      }

      for (let p = 0; p < outter.length; p++) {
        const ret = getTheHighestSeverity(outter[p][0], outter[p][2]);

        const tmp_polygon = {
          type: "Feature",
          geometry: {
            type: outter[p][2][0]["type"],
            coordinates: outter[p][2][0]["coordinates"],
          },
          properties: {
            link: outter[p][0][ret[4]][0],
            type: "geojson",
            severity: outter[p][0][ret[4]][1],
            urgency: outter[p][0][ret[4]][4],
            certainty: outter[p][0][ret[4]][5],
            pastday: outter[p][0][ret[4]][6],
            event: outter[p][0][ret[4]][2],
            // coord: JSON.stringify(outter[p][2]),
            // lists: ret,
            same: outter[p][0][ret[4]][7],
            marine: outter[p][0][ret[4]][8],
            jsonName: outter[p][0][ret[4]][9],
            rLink: outter[p][0][ret[4]][10],
            linkType: outter[p][0][ret[4]][11],
            sourceId: outter[p][0][ret[4]][12],
            utc: utc,
          },
        };

        polygon_json.push(tmp_polygon);
      }
    }

    if (circle_container.length > 0) {
      /**circle**/
      const outter = [];
      let chkkey1 = "";
      let chkkey2 = "";

      for (let a = 0; a < circle_container.length; a++) {
        let same_idx = -1;

        chkkey1 = circle_container[a][4];
        if (checked[jsonName].indexOf(chkkey1) == -1) {
          checked[jsonName].push(chkkey1);
          for (let b = a + 1; b < circle_container.length; b++) {
            chkkey2 = circle_container[b][4];
            if (chkkey1 == chkkey2) {
              same_idx = checked[jsonName].length - 1;
              same[jsonName][same_idx] = [circle_container[a][1]];
              samePD[jsonName][same_idx] = [circle_container[a][8]];
              break;
            }
          }
        } else {
          same_idx = checked[jsonName].indexOf(chkkey1);
          if (
            same_idx != -1 &&
            same[jsonName][same_idx].indexOf(circle_container[a][1]) == -1
          ) {
            same[jsonName][same_idx].push(circle_container[a][1]);
            samePD[jsonName][same_idx].push(circle_container[a][8]);
          }
        }

        const tank = [];
        const tmp = [];
        tmp.push(circle_container[a][0]);
        tmp.push(circle_container[a][1]);
        tmp.push(circle_container[a][2]);
        tmp.push(circle_container[a][3]);
        tmp.push(circle_container[a][6]);
        tmp.push(circle_container[a][7]);
        tmp.push(circle_container[a][8]);
        tmp.push(same_idx);
        tmp.push(circle_container[a][9]); //marine
        tmp.push(circle_container[a][10]); //jsonName
        tmp.push(circle_container[a][11]); //rLink
        tmp.push(circle_container[a][12]); //linkType
        tmp.push(circle_container[a][13]); //sourceId
        tank.push(tmp);

        const each = [];
        each.push(tank);
        each.push(circle_container[a][4]);
        each.push(circle_container[a][5]);
        outter.push(each);
      }

      for (let p = 0; p < outter.length; p++) {
        const ret = getTheHighestSeverity(outter[p][0], outter[p][2]);
        const circleCoord = outter[p][1].split(",");

        const tmp_polygon = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [circleCoord[1], circleCoord[0]],
          },
          properties: {
            link: outter[p][0][ret[4]][0],
            type: "circle",
            severity: outter[p][0][ret[4]][1],
            urgency: outter[p][0][ret[4]][4],
            certainty: outter[p][0][ret[4]][5],
            pastday: outter[p][0][ret[4]][6],
            event: outter[p][0][ret[4]][2],

            // coord: outter[p][1],
            radius: Number(outter[p][2]),

            // lists: ret,
            same: outter[p][0][ret[4]][7],
            marine: outter[p][0][ret[4]][8],
            jsonName: outter[p][0][ret[4]][9],
            rLink: outter[p][0][ret[4]][10],
            linkType: outter[p][0][ret[4]][11],
            sourceId: outter[p][0][ret[4]][12],
            utc: utc,
          },
        };
        polygon_json.push(tmp_polygon);
      }
    }

    if (marker_container.length > 0) {
      /**marker**/
      const outter = [];
      let chkkey1 = "";
      let chkkey2 = "";

      for (let a = 0; a < marker_container.length; a++) {
        let same_idx = -1;

        chkkey1 = marker_container[a][4];

        if (checked[jsonName].indexOf(chkkey1) == -1) {
          checked[jsonName].push(chkkey1);
          for (let b = a + 1; b < marker_container.length; b++) {
            chkkey2 = marker_container[b][4];
            if (chkkey1 == chkkey2) {
              same_idx = checked[jsonName].length - 1;
              same[jsonName][same_idx] = [marker_container[a][1]];
              samePD[jsonName][same_idx] = [marker_container[a][8]];
              break;
            }
          }
        } else {
          same_idx = checked[jsonName].indexOf(chkkey1);
          if (
            same_idx != -1 &&
            same[jsonName][same_idx].indexOf(marker_container[a][1]) == -1
          ) {
            same[jsonName][same_idx].push(marker_container[a][1]);
            samePD[jsonName][same_idx].push(marker_container[a][8]);
          }
        }

        const tank = [];
        const tmp = [];
        tmp.push(marker_container[a][0]);
        tmp.push(marker_container[a][1]);
        tmp.push(marker_container[a][2]);
        tmp.push(marker_container[a][3]);
        tmp.push(marker_container[a][6]);
        tmp.push(marker_container[a][7]);
        tmp.push(marker_container[a][8]);
        tmp.push(same_idx);
        tmp.push(marker_container[a][9]); //marine
        tmp.push(marker_container[a][10]); //jsonName
        tmp.push(marker_container[a][11]); //rLink
        tmp.push(marker_container[a][12]); //linkType
        tmp.push(marker_container[a][13]); //sourceId
        tank.push(tmp);

        const each = [];
        each.push(tank);
        each.push(marker_container[a][4]);
        each.push(marker_container[a][5]);
        outter.push(each);
      }

      for (let p = 0; p < outter.length; p++) {
        const ret = getTheHighestSeverity(outter[p][0], outter[p][2]);
        const markerCoord = outter[p][2].split(",");

        const tmp_polygon = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [markerCoord[1], markerCoord[0]],
          },
          properties: {
            link: outter[p][0][ret[4]][0],
            type: "marker",
            severity: outter[p][0][ret[4]][1],
            urgency: outter[p][0][ret[4]][4],
            certainty: outter[p][0][ret[4]][5],
            pastday: outter[p][0][ret[4]][6],
            event: outter[p][0][ret[4]][2],
            // coord: JSON.stringify(outter[p][2]),
            // lists: ret,
            same: outter[p][0][ret[4]][7],
            marine: outter[p][0][ret[4]][8],
            jsonName: outter[p][0][ret[4]][9],
            rLink: outter[p][0][ret[4]][10],
            linkType: outter[p][0][ret[4]][11],
            sourceId: outter[p][0][ret[4]][12],
            utc: utc,
          },
        };

        polygon_json.push(tmp_polygon);
      }
    }

    return polygon_json;
  });
};

const standardizeCap = (capJson) => {
  return Object.keys(capJson).reduce((all, key) => {
    if (key.startsWith("cap:")) {
      const itemKey = key.slice(4);
      if (isPlainObject(capJson[key])) {
        all[itemKey] = standardizeCap(capJson[key]);
      } else {
        all[itemKey] = capJson[key];
      }
    } else {
      all[key] = capJson[key];
    }
    return all;
  }, {});
};

const polygonToFeature = (coordsStr) => {};

const getDetail = (capLink, type) => {
  const url = `${CAP_DETAIL_URL_BASE}/${capLink}`;

  return axios.get(url).then((res) => {
    const capXmlData = res.data;
    const capJsonData = txml.parse(capXmlData, { simplify: true });

    const standardCapJsonData = standardizeCap(capJsonData);

    const alert = standardCapJsonData.alert;

    const { area } = (alert && alert.info) || {};

    let featureColl = {
      type: "FeatureCollection",
      features: [],
    };

    if (area && !!area.length) {
      for (let i = 0; i < area.length; i++) {
        const areaItem = area[i];
        if (areaItem.polygon) {
          const polygon = areaItem.polygon.split(" ");
          const tmpCList = [];
          for (let j = 0; j < polygon.length; j++) {
            let tmpC = polygon[j].split(",");

            const tmp = tmpC[1];
            tmpC[1] = parseFloat(tmpC[0]);
            tmpC[0] = parseFloat(tmp);

            tmpCList.push(tmpC);
          }

          var tmp_polygon = {
            type: "Feature",
            id: `${alert.identifier}-${
              areaItem.areaDesc ? slugify(areaItem.areaDesc) : i
            }`,
            geometry: {
              type: "Polygon",
              coordinates: [tmpCList],
            },
            properties: { areaDesc: areaItem.areaDesc },
          };

          featureColl.features.push(tmp_polygon);
        }
      }
    }

    featureColl = rewind(featureColl, false);

    alert.info.area = featureColl;

    // remove unnecessary properties
    // delete alert._attributes;
    // delete alert.info.area;
    // delete alert.info.circle;
    // delete alert.info.polygon;

    const detail = { capLink: capLink, alert: alert };

    return detail;
  });
};

class AlertsService {
  static async getAlerts() {
    return all(
      COUNTRIES_LIST.map((country) => {
        const d = new Date();
        const utc = getUTC();

        return getData(country, utc).then((data) => {
          return data;
        });
      })
    )
      .then(
        spread((...responses) => {
          return responses.reduce(
            (all, item) => {
              all.features = all.features.concat(item);
              return all;
            },
            {
              type: "FeatureCollection",
              features: [],
            }
          );
        })
      )
      .then((geojson) => {
        const features = geojson.features
          .filter((f) => f !== null)
          .reduce((all, item) => {
            let alertItem;
            if (item.properties.jsonName == "others") {
              if (booleanIntersects(africaGeojson, item)) {
                alertItem = item;
              }
            } else {
              alertItem = item;
            }

            if (alertItem) {
              const sourceInfo = alertSources[alertItem.properties.sourceId];

              if (sourceInfo) {
                alertItem.properties.sourceInfo = sourceInfo;
              }

              all.push(alertItem);
            }

            return all;
          }, [])
          .map((feature) => {
            if (feature.properties.type === "circle") {
              const f = turfCircle(feature, feature.properties.radius);
              return { ...f, properties: feature.properties };
            }

            return feature;
          });

        features.sort(function (a, b) {
          return a.properties.severity - b.properties.severity;
        });

        return { ...geojson, features: features };
      });
  }
  static async getAlertsDetail(alertsGeojson) {
    if (
      alertsGeojson &&
      alertsGeojson.features &&
      !isEmpty(alertsGeojson.features)
    ) {
      const requests = alertsGeojson.features.reduce((all, item) => {
        if (item.properties.link) {
          all.push(getDetail(item.properties.link));
        }
        return all;
      }, []);

      return all(requests).then(
        spread((...responses) => {
          return responses;
        })
      );
    }

    return {};
  }
  static async getAlertDetail(capUrl, type) {
    return getDetail(capUrl, type);
  }
}

export default AlertsService;
