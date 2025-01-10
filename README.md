Dieses Repository beinhaltet den Referenzcode zur Vorlesung "Echtzeit Computergrafik" der Hochschule Furtwangen im Wintersemester 2024/25.

# Code aus der Vorlesung

In den nummerierten Ordnern befinden sich Javascript-Dateien, die in den Vorlesungen verwendet wurden. 
Sie können diese in den [Playground](https://rt3d.dev/playground) kopieren, um sie anzusehen und zu bearbeiten.

Für das Projekt, oder wenn Sie das Ergebnis einer Vorlesung lokal ansehen wollen, können Sie die Datei `index.html` im gleichen Verzeichnis wie diese README-Datei verwenden.
Die Datei `index.html` ist eine normale Webseite, die die Glance-Bibliothek aus dem Internet nachlädt und ein wenig Boilerplate Code enthält, damit der gleiche Code wie in der Vorlesung auch lokal läuft. Sie können Ihren eigenen Code oder den aus der Vorlesung in `script.js` kopieren, damit das Ergebnis auf der Webseite angezeigt wird.
Es wird wahrscheinlich nicht ausreichen, die Datei `index.html` mit einem Browser zu öffnen - moderne Browser weigern sich, Daten aus dem Internet zu laden, wenn sie eine lokale Datei (oder andere Dateien auf der Festplatte) öffnen. Dies geschieht aus Sicherheitsgründen und zwingt uns, einen lokalen Webserver zu verwenden.
Am einfachsten geht das mit [Python](https://www.python.org/). Installieren Sie Python3, navigieren Sie im Terminal zu diesem Verzeichnis und starten Sie einen einfachen Entwicklungsserver:

```bash
python -m http.server
```

Alternativ können Sie auch [NodeJS](https://nodejs.org/) oder jeden anderen Webserver verwenden. 
Sie sollten dann in der Lage sein, die Datei im Browser zu öffnen. Der Python-Webserver verwendet standardmäßig die Adresse `http://0.0.0.0:8000/`, aber Sie müssen möglicherweise `http://localhost:8000/` in den Browser eingeben, um darauf zuzugreifen.

Sollte es bei Ihnen trotzdem nicht funktionieren, kontaktieren Sie mich bitte.

# Glance

Die glance Library befindet sich im Ordner `glance` unterhalb des Hauptverzeichnisses. Die Bibliothek ist in Typescript geschrieben. Sie sollten aber damit zurechtkommen, auch wenn Sie bisher nur Javascript programmiert haben.
Um glance im Browser zu verwenden, müssen Sie die kompilierte Javascript-Version der Bibliothek in den Browser laden.
Die Datei `index.html` tut dies wie folgt:

```html
<script src="https://echtzeit-computergrafik-ws24.github.io/src/glance-v0.4.24-dev.min.js"></script>
```

Die Datei `glance-v0.4.24-dev.min.js` ist minifiziertes Javascript und ist nicht dafür gedacht gelesen oder modifziert zu werden.

Noch einmal zur Erinnerung: Sie müssen glance nicht verwenden. Ich freue mich umso mehr, wenn Sie eine eigene Utility-Bibliothek geschrieben haben, um WebGL benutzerfreundlicher zu machen. Sie müssen auch nicht die HTML-Datei verwenden. Wichtig ist nur, dass Ihr Code am Ende bei mir im Browser läuft, ohne dass ich viel Zeit damit verbringen muss, Ihre Toolchain bei mir nachzubauen. 
Die einzige Ausnahme sind diejenigen, die am Anfang des Semesters gefragt haben, ob sie das Projekt in einer anderen Umgebung als Javascript / WebGL abgeben dürfen. 
