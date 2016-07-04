'use strict';

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const glob = require('glob');
const ticketModel = require('client/applications/ticket/model.jsx');
const ticketModelFactory = React.createFactory(ticketModel);
const upperCaseLocale = require('helpers/upper_case_locale');
const config = require('config');
const tusk = require('api/tusk/driver');
const getRole = require('helpers/get_role');
const roleConfig = config('invoker_approver') || {};

const regions = {};
const languages = Object.keys(config('region')[0].name);
languages.forEach((lang) => {
  regions[lang] = [];
  config('region').forEach((reg) => {
    regions[lang].push({
      name: reg.name[lang],
      id: reg.id
    });
  });
});

const files = glob.sync('*', {
  cwd: 'client/dist/'
});
const uskinFile = glob.sync('*.uskin.min.css', {
  cwd: 'client/dist/uskin'
});
const locales = JSON.parse(JSON.stringify(global.locales.availableLocales)).map(upperCaseLocale);
const staticFiles = {};
locales.forEach((locale) => {
  staticFiles[locale] = {};
  let regex = new RegExp(locale + '.ticket.min.js$');
  files.some((file) => {
    return file.match(regex) && (staticFiles[locale].ticketJsFile = file);
  });
});
staticFiles.ticketCssFile = files.find((el) => {
  return el.match(/ticket.min.css$/) !== null;
});

let applications;
const async = require('async');

function renderProjectTemplate (req, res, next) {
  async.parallel(
    [function (callback) {
      tusk.getSettingsByApp('ticket', (err, results) => {
        if (err) {
          callback(err);
        } else {
          callback(null, results);
        }
      }, false);
    },
    function (callback) {
      tusk.getSettingsByApp('global', (err, results) => {
        if (err) {
          callback(err);
        } else {
          callback(null, results);
        }
      }, false);
    }
  ], function (err, results) {
    let setting = {};
    if (!err) {
      let ticketSettings = results[0];
      let globalSettings = results[1];
      globalSettings.forEach(s => setting[s.name] = s.value);
      ticketSettings.forEach(s => setting[s.name] = s.value);
    }
    let favicon = setting.favicon ? setting.favicon : '/static/assets/favicon.ico';
    let title = setting.title ? setting.title : 'UnitedStack 有云';
    let _enableTicket = setting.enable_ticket;
    if (req.session && req.session.user && _enableTicket) {
      let locale = upperCaseLocale(req.i18n.getLocale());
      let __ = req.i18n.__.bind(req.i18n);
      let user = req.session.user;
      let username = user.username;
      let _enableCharge = setting.enable_charge;
      let applicationList = applications
      .filter(a => {
        switch (a) {
          case 'admin':
            return user.isAdmin;
          case 'bill':
            return _enableCharge;
          case 'ticket':
            return _enableTicket;
          default:
            return true;
        }
      })
      .sort((a, b) => {
        if (a === 'dashboard') {
          return -1;
        } else if (b === 'dashboard') {
          return 1;
        } else {
          return 0;
        }
      }).map(_app => {
        return {[_app]: __(`shared.${_app}.application_name`)};
      });
      let _application = {
        application_list: applicationList,
        current_application: 'ticket'
      };
      let selfTicket = true;
      let othersTicket = true;
      if (_enableTicket) {
        let roleObj = getRole(req.session.user.roles, roleConfig);
        if (!roleObj.showSelf) {
          selfTicket = false;
        }
        if (!roleObj.showOthers) {
          othersTicket = false;
        }
      }
      let HALO = {
        configs: {
          lang: locale,
          domain: config('domain'),
          ticket: _enableTicket ? {show_self: selfTicket, show_others: othersTicket} : null
        },
        user: {
          projectId: user.projectId,
          projects: user.projects,
          userId: user.userId,
          username: username
        },
        region_list: regions[locale],
        current_region: user.regionId ? user.regionId : regions[locale][0].id,
        application: _application,
        settings: setting
      };
      res.render('ticket', {
        HALO: JSON.stringify(HALO),
        mainJsFile: staticFiles[locale].ticketJsFile,
        mainCssFile: staticFiles.ticketCssFile,
        uskinFile: uskinFile[0],
        favicon: favicon,
        title: title,
        modelTmpl: ReactDOMServer.renderToString(ticketModelFactory({
          __: __('shared.ticket'),
          HALO: HALO
        }))
      });
    } else {
      res.redirect('/');
    }
  });
}

module.exports = (app, clientApps) => {
  let views = app.get('views');
  views.push(__dirname);
  applications = clientApps;
  app.get(/(^\/ticket$)|(^\/ticket\/(.*))/, renderProjectTemplate);
};
