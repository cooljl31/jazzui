/* globals angular: true, window: true, document: true */

var xon = require('xon')
  , Tip = require('tip')
  , Slider = require('slider')

  , Manager = require('./manager')
  , LocalStore = require('./store').LocalStore
  , ApiStore = require('./store').ApiStore

  , tpls = require('./tpls')
  , utils = require('./utils')

// yes this is evil, but firefox doesn't support `zoom`. So I have to do some
// magic.
var amIonFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') !== -1

angular.module('helpers', []).factory('manager', function () {
  return new Manager(document)
}).directive("toggle", function() {
  return {
    restrict: "A",
    link: function(scope, element, attrs) {
      if (attrs.toggle.indexOf('tooltip') !== 0) return;
      var tip
      , direction = attrs.toggle.split('-')[1] || undefined
      setTimeout(function() {
        tip = utils.tipMe(element[0], element.attr('title'), direction)
      }, 0);
      attrs.$observe('title', function () {
        if (tip) tip.message(element.attr('title'))
      });
      scope.$on('$destroy', function () {
        tip.hide()
      });
    }
  };
})

function MainController (manager, $scope, store) {
  // $scope.docTitle = 'Untitled'
  $scope.zoomLevel = 80;

  var hash = utils.initHash(window.location.hash)
  store.currentHash = hash

  function load(hash) {
    $scope.loading = true
    store.get(hash, function (err, title, data, cached) {
      if (err) {
        $scope.serverError = err.message
        data = {}
      }
      $scope.loading = false
      mirrors.less.setValue(data.less || tpls.less)
      mirrors.less.clearSelection()
      mirrors.jade.setValue(data.jade || tpls.jade)
      mirrors.jade.clearSelection()
      mirrors.xon.setValue(data.xon || tpls.xon)
      mirrors.xon.clearSelection()
      $scope.docTitle = title || 'Untitled'
      if (!cached) $scope.$digest()
    })
  }

  window.addEventListener('hashchange', function () {
    if ('#' + hash == window.location.hash) return
    hash = utils.initHash(window.location.hash)
    store.currentHash = hash
    load(hash)
    $scope.$digest()
  })

  manager.zoomIt = function (el) {
    el.style.zoom = $scope.zoomLevel + '%';
    if (amIonFirefox) {
      el.style.MozTransform = 'scale(' + $scope.zoomLevel/100 + ')';
      var p = -(50/$scope.zoomLevel - .5) * 100 + '%'
      console.log('transfff', p)
      el.style.top = el.style.left = el.style.bottom = el.style.right = p
    }
  }

  $scope.$watch('docTitle', utils.debounce(function (value, prev) {
    if (!value) return
    // if (!prev && value === 'Untitled') return
    var data = {
      modified: new Date()
    }
    store.saveName(hash, value, function (err) {
      window.location.hash = hash
    })
  }))

  $scope.getModifiedTime = function (doc) {
    return doc.modified.getTime()
  }

  $scope.download = function () {
    var blob = utils.createZip(tpls, mirrors)
    document.getElementById('download-link').href = window.URL.createObjectURL(blob);
    $scope.showDlDialog = true
  }
  $scope.closeDlDialog = function () {
    $scope.showDlDialog = false
  }
  $scope.open = function () {
    store.list(function (err, docs, cached) {
      if (err) {
        $scope.serverError = err.message
      } else {
        $scope.serverError = null
        $scope.docs = docs
      }
      if (!cached) $scope.$digest()
    })
    $scope.showOpenDialog = true
  }
  $scope.openDoc = function (doc) {
    window.location.hash = doc.hash
    $scope.showOpenDialog = false
  }
  $scope.removeDoc = function (doc, e) {
    e.preventDefault()
    e.stopPropagation()
    store.remove(doc.hash, function (err, docs, cached) {
      if (err) {
        $scope.serverError = err.message
      } else {
        $scope.serverError = null
        $scope.docs = docs
      }
      if (!cached) $scope.$digest()
      if (store.currentHash === doc.hash) window.location.hash = '';
    })
    return false
  }
  $scope.closeOpenDialog = function () {
    $scope.showOpenDialog = false
  }

  $scope.duplicate = function () {
    var id = utils.genId()
    store.save(
      id,
      $scope.docTitle,
      {
        less: mirrors.less.getValue(),
        jade: mirrors.jade.getValue(),
        xon: mirrors.xon.getValue()
      },
      function (err, cached) {
        if (err) {
          $scope.serverError = err.message
        } else {
          $scope.serverError = null
        }
        if (!cached) $scope.$digest()
      }
    )
    window.location.hash = id
  }

  $scope.new = function () {
    window.location.hash = ''
  }
  
  $scope.zoomIn = function () {
    if ($scope.zoomLevel < 250) {
      $scope.zoomLevel += 10
    }
  }

  $scope.zoomOut = function () {
    if ($scope.zoomLevel > 20) {
      $scope.zoomLevel -= 10;
    }
  }

  var outputEl = document.getElementById('output')
  $scope.fullScreen = false
  $scope.$watch('zoomLevel', function (value) {
    manager.els.output.style.zoom = value + '%';
    manager.els.output.style.MozTransform = 'scale(' + value/100 + ')'
    if (amIonFirefox) {
      var p = -(50/$scope.zoomLevel - .5) * 100 + '%'
      manager.els.output.style.top = manager.els.output.style.left = manager.els.output.style.bottom = manager.els.output.style.right = p
    }
  })
  $scope.$watch('fullScreen', function (value) {
    if (value) manager.els.output.classList.add('fullScreen')
    else manager.els.output.classList.remove('fullScreen')
  })
  $scope.toggleFullScreen = function () {
    $scope.fullScreen = !$scope.fullScreen
    if (!$scope.fullScreen) {
      $scope.minimized = false
    }
  }
  $scope.minimized = false
  $scope.toggleMinimized = function () {
    $scope.minimized = !$scope.minimized
  }

  var mirrors = {}
    , langs = ['jade', 'less', 'xon']
    , cmLangs = {
        jade: 'jade',
        less: 'less',
        xon: 'javascript'
      }

  langs.forEach(function (lang) {
    mirrors[lang] = utils.makeMirror(
      lang, document.getElementById(lang + '-mirror'),
      cmLangs[lang], store, manager[lang].bind(manager),
      function (err) {
      }
    )
  })

  window.mirrors = mirrors

  configureLess(mirrors.less, document.getElementById('less-mirror'))

  load(hash)

}

function configureLess(editor, el) {
  // require('ace-slider')(editor, el)
  require('ace-colorslider')(editor, el)
}

module.exports = function (document, window, server) {
  var manager = new Manager(document)
  var app = angular.module('JazzUI', ['helpers'])
  app.controller('MainController', ['$scope', 'store', MainController.bind(null, manager)])

  var myApp = angular.module('MyApp', [])
    .controller('MainController', ['$scope', function ($scope) {
      $scope.loadingData = true
      console.log('hi', manager)
      manager.xon(null, $scope, myApp)
    }])

  var store
  if (server === true) server = window.location.origin + '/'
  if (!server) store = new LocalStore(window.localStorage)
  else store = new ApiStore(server)

  app.factory('store', function () {
    return store
  })
  
  // check that our server's functioning
  store.list(function (err) {
    if (err) {
      alert('Server not running; switching to LocalStorage. Documents saved will only be available from this browser.')
      store = new LocalStore(window.localStorage)
    }
    angular.bootstrap(document.getElementById("interaction"), ["JazzUI"])
  })

  window.manager = manager
}
