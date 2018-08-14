import axios from 'axios';
import SectionModel from "./model/SectionModel";
// import DocumentModel from "./model/DocumentModel.js";
// import ResourceModel from "./model/ResourceModel.js";

/**
 * Manager for server communication
 */
export default class RestClient {

    HTTP = axios.create({
        baseURL: `http://jsonplaceholder.typicode.com/`,
        headers: {
            Authorization: 'Bearer {token}'
        }
    });

    constructor() {
    }

    getTree() {
        return new SectionModel(0, "Hallo", [], [], [])
    }

    getFileContent(documentId) {
        return "# TutorialTooltip [![API](https://img.shields.io/badge/API-14%2B-brightgreen.svg?style=flat)](https://android-arsenal.com/api?level=14)\n" +
            "A simple and easy way to add targeted tutorial messages to your app.\n" +
            "\n" +
            "# Work in progress\n" +
            "*This library is still very much a work in progress and not ready to use.*\n" +
            "\n" +
            "# Build Status\n" +
            "\n" +
            "| Master       | Beta | Dev               |\n" +
            "|--------------|------|-------------------|\n" +
            "| ![Master](https://travis-ci.org/markusressel/TutorialTooltip.svg?branch=master) | ![Beta](https://travis-ci.org/markusressel/TutorialTooltip.svg?branch=beta) | ![Dev](https://travis-ci.org/markusressel/TutorialTooltip.svg?branch=dev) |\n" +
            "\n" +
            "# Why?\n" +
            "\n" +
            "I needed a better way to create step by step tutorials for my app(s) and even though there were existing libraries to help with this they didn't offer the flexibility I was looking for. I could have taken an existing library and customize it for my needs, but it was just a pain to get through the existing code and I didnt learn much about how to build stuff like this. So I thought to myself - why dont you build it yourself from the ground up? And here I am.\n" +
            "\n" +
            "# Usage\n" +
            "\n" +
            "## Gradle\n" +
            "To use this library just include it in your depencencies using\n" +
            "\n" +
            "    repositories {\n" +
            "        ...\n" +
            "        maven { url \"https://jitpack.io\" }\n" +
            "    }\n" +
            "\n" +
            "in your project build.gradle file and\n" +
            "\n" +
            "    dependencies {\n" +
            "        compile 'com.github.markusressel:TutorialTooltip:v0.9.0'\n" +
            "    }\n" +
            "\n" +
            "in your desired module build.gradle file.\n" +
            "\n" +
            "## Create a TutorialTooltip\n" +
            "\n" +
            "To create a ```TutorialTooltip``` you can use the builder pattern:\n" +
            "\n" +
            "##### Using an Anchor View\n" +
            "\n" +
            "    TutorialTooltipBuilder tutorialTooltipBuilder =\n" +
            "        new TutorialTooltipBuilder(this)\n" +
            "            .anchor(button1) // anchor view\n" +
            "            .build();\n" +
            "\n" +
            "##### Using an Anchor Point\n" +
            "\n" +
            "    TutorialTooltipBuilder tutorialTooltipBuilder =\n" +
            "            new TutorialTooltipBuilder(this)\n" +
            "                .anchor(new Point(200, 300)) // anchor point\n" +
            "                .build();\n" +
            "\n" +
            "This is the most basic ```TutorialTooltip``` you can create.\n" +
            "\n" +
            "## Show a TutorialTooltip\n" +
            "\n" +
            "If you used the builder to create your ```TutorialTooltip``` you can afterwards show it very easily by calling:\n" +
            "\n" +
            "    înt tutorialTooltipId = TutorialTooltip.show(tutorialTooltipBuilder);\n" +
            "\n" +
            "If you used ```TutorialTooltip.make(tutorialTooltipBuilder)``` you can show it using:\n" +
            "\n" +
            "    înt tutorialTooltipId = TutorialTooltip.show(tutorialTooltipView);\n" +
            "\n" +
            "## Remove a TutorialTooltip\n" +
            "\n" +
            "To remove a ```TutorialTooltip``` either hold a reference to its view and call:\n" +
            "\n" +
            "    tutorialTooltipView.remove();\n" +
            "\n" +
            "on the respective view object.\n" +
            "\n" +
            "Or (if you attached it to an activity) you can use a static method and remove it by its ID:\n" +
            "\n" +
            "    TutorialTooltip.remove(activity, tutorialTooltipId);\n" +
            "\n" +
            "## Customization\n" +
            "\n" +
            "The first example will show a default ```TutorialTooltipIndicator``` and default ```TutorialTooltipMessage``` so you can test things without getting to much into the details.\n" +
            "Of course this small example is not enough for everyday usage, so let's start with some more advanced ones and increase complexity down the road.\n" +
            "\n" +
            "FYI: In it's current state you can only create and customize TutorialTooltips in code. Styling via theme attributes or xml views may be added at a later stage.\n" +
            "\n" +
            "### Message\n" +
            "\n" +
            "##### Basic\n" +
            "---\n" +
            "\n" +
            "The ```TutorialTooltip``` library allows you to customize the message in a fast and easy way using the builder pattern (again). To customize the look of the message use something like this in your ```TutorialTooltipBuilder```:\n" +
            "\n" +
            "    .message(new MessageBuilder()\n" +
            "        .text(\"This is a tutorial message!\")\n" +
            "        .build()\n" +
            "    )\n" +
            "\n" +
            "##### Advanced\n" +
            "---\n" +
            "\n" +
            "There are other builder methods you can use to further customize the look of the message. Just have a look at the ```MessageBuilder``` class.\n" +
            "\n" +
            "A more complex example would look something like this:\n" +
            "\n" +
            "    .message(new MessageBuilder()\n" +
            "        .customView(new CardMessageView(activity))\n" +
            "        .text(\"This is a tutorial message!\")\n" +
            "        .textColor(Color.BLACK)\n" +
            "        .backgroundColor(Color.WHITE)\n" +
            "        .gravity(TutorialTooltipView.Gravity.LEFT) // relative to the indicator\n" +
            "        .onClick(new OnMessageClickedListener() {\n" +
            "            @Override\n" +
            "            public void onMessageClicked(int id, TutorialTooltipMessage message, View messageView) {\n" +
            "                TutorialTooltip.remove(activity, id);\n" +
            "            }\n" +
            "        })\n" +
            "        .build()\n" +
            "    )\n" +
            "\n" +
            "##### Geek\n" +
            "---\n" +
            "\n" +
            "If you don't like the look of the included message you can override it completely with a custom view. To use a custom view as a message you have to make it:\n" +
            "\n" +
            "1. extend ```android.view.View``` (at least indirectly like with f.ex. ```LinearLayout```)\n" +
            "2. implement the ```TutorialTooltipMessage``` interface included in this library\n" +
            "\n" +
            "This makes it possible to use the ```MessageBuilder``` even when using a completely self written ```TutorialTooltipMessage``` view which hopefully cleans up the code quite a bit.\n" +
            "\n" +
            "Just add this line to your  ```MessageBuilder ```:\n" +
            "\n" +
            "    .customView(new CardMessageView(activity))\n" +
            "\n" +
            "### Indicator\n" +
            "\n" +
            "##### Basic\n" +
            "---\n" +
            "\n" +
            "The indicator view can be customized in the same way as the message.\n" +
            "Customize the indicator using the ```MessageBuilder``` in your ```TutorialTooltipBuilder``` like so::\n" +
            "\n" +
            "    .indicator(new IndicatorBuilder()\n" +
            "        .size(100, 100) // size values in pixel\n" +
            "        .build()\n" +
            "    )\n" +
            "\n" +
            "##### Advanced\n" +
            "---\n" +
            "\n" +
            "Just like with the message you can further customize the indicator with something similar to this:\n" +
            "\n" +
            "    .indicator(new IndicatorBuilder()\n" +
            "        .size(100, 100) // size values in pixel\n" +
            "        .offset(50, 50) // offset values in pixel\n" +
            "        .onClick(new OnIndicatorClickedListener() {\n" +
            "            @Override\n" +
            "            public void onIndicatorClicked(int id, TutorialTooltipIndicator indicator, View indicatorView) {\n" +
            "                TutorialTooltip.remove(activity, id);\n" +
            "            }\n" +
            "        })\n" +
            "        .build()\n" +
            "    )\n" +
            "\n" +
            "Have a look at the ```MessageBuilder``` class for a full list of options.\n" +
            "\n" +
            "##### Geek\n" +
            "---\n" +
            "\n" +
            "If you don't like the look of the included indicator you can override it completely with a custom view. To use a custom view as an indicator you have to make it:\n" +
            "\n" +
            "1. extend ```android.view.View``` (at least indirectly like with f.ex. ```LinearLayout```)\n" +
            "2. implement the ```TutorialTooltipIndicator``` interface included in this library\n" +
            "\n" +
            "This makes it possible to use the ```IndicatorBuilder``` even when using a completely self written ```TutorialTooltipIndicator``` view which hopefully cleans up the code quite a bit.\n" +
            "\n" +
            "Just add this line to your  ```IndicatorBuilder ```:\n" +
            "\n" +
            "     .customView(new WaveIndicatorView(activity))\n" +
            "\n" +
            "### Bringing it all together\n" +
            "\n" +
            "A fully customized TutorialTooltip can then look something like this:\n" +
            "\n" +
            "    // custom message view\n" +
            "    CardMessageView cardMessageView = new CardMessageView(getActivity());\n" +
            "\n" +
            "    // custom indicator view\n" +
            "    WaveIndicatorView waveIndicatorView = new WaveIndicatorView(getActivity());\n" +
            "    waveIndicatorView.setStrokeWidth(10); // customization that is not included in the IndicatorBuilder\n" +
            "\n" +
            "    TutorialTooltipBuilder tutorialTooltipBuilder = new TutorialTooltipBuilder(getActivity())\n" +
            "    .anchor(button)\n" +
            "    .attachToDialog(getDialog())\n" +
            "    .message(new MessageBuilder()\n" +
            "        .customView(cardMessageView)\n" +
            "        .offset(0, 0)\n" +
            "        .text(\"This is a tutorial message!\")\n" +
            "        .textColor(Color.BLACK)\n" +
            "        .backgroundColor(Color.WHITE)\n" +
            "        .gravity(TutorialTooltipView.Gravity.TOP) // relative to the indicator\n" +
            "        .onClick(new OnMessageClickedListener() {\n" +
            "            @Override\n" +
            "            public void onMessageClicked(int id, TutorialTooltipView tutorialTooltipView, TutorialTooltipMessage message, View messageView) {\n" +
            "                // this will intercept touches only for the message view\n" +
            "                // if you don't want the main OnTutorialTooltipClickedListener listener to react to touches here\n" +
            "                // just specify an empty OnMessageClickedListener\n" +
            "\n" +
            "                TutorialTooltip.remove(getDialog(), id);\n" +
            "            }\n" +
            "        })\n" +
            "        .size(MessageBuilder.WRAP_CONTENT, MessageBuilder.WRAP_CONTENT)\n" +
            "        .build()\n" +
            "    )\n" +
            "    .indicator(new IndicatorBuilder()\n" +
            "        .customView(waveIndicatorView)\n" +
            "        .offset(0, 0)\n" +
            "        .size(200, 200)\n" +
            "        .color(Color.BLUE)\n" +
            "        .onClick(new OnIndicatorClickedListener() {\n" +
            "            @Override\n" +
            "            public void onIndicatorClicked(int id, TutorialTooltipView tutorialTooltipView, TutorialTooltipIndicator indicator, View indicatorView) {\n" +
            "                // this will intercept touches only for the indicator view\n" +
            "                // if you don't want the main OnTutorialTooltipClickedListener listener to react to touches here\n" +
            "                // just specify an empty OnIndicatorClickedListener\n" +
            "\n" +
            "                TutorialTooltip.remove(getDialog(), id);\n" +
            "            }\n" +
            "        })\n" +
            "        .build())\n" +
            "    .onClick(new OnTutorialTooltipClickedListener() {\n" +
            "        @Override\n" +
            "        public void onTutorialTooltipClicked(int id, TutorialTooltipView tutorialTooltipView) {\n" +
            "            // this will intercept touches of the complete window\n" +
            "            // if you don't specify additional listeners for the indicator or\n" +
            "            // message view they will be included\n" +
            "\n" +
            "            TutorialTooltip.remove(getDialog(), id);\n" +
            "        }\n" +
            "    })\n" +
            "    .build();\n" +
            "\n" +
            "    TutorialTooltip.show(tutorialTooltipBuilder);\n" +
            "\n" +
            "## Troubleshooting\n" +
            "\n" +
            "### .build()\n" +
            "---\n" +
            "\n" +
            "Always remember to finish your builder with the ```.build()``` call. This makes sure you don't change your builder after already using it.\n" +
            "This is necessary for all builders including ```TutorialTooltipBuilder```, ```MessageBuilder``` and ```IndicatorBuilder```.\n" +
            "\n" +
            "### Dialogs\n" +
            "---\n" +
            "\n" +
            "If the ```TutorialTooltip``` is used in a ```Dialog``` (f.ex. ```DialogFragment```) you have to additionally call:\n" +
            "\n" +
            "    .attachToDialog(getDialog())\n" +
            "\n" +
            "in the ```TutorialTooltipBuilder```. This will attach the ```TutorialTooltip``` to the ```DecorView``` of the ```Dialog``` instead of the ```Activity```.\n" +
            "\n" +
            "### Attach to Window\n" +
            "---\n" +
            "\n" +
            "If somehow the ```TutorialTooltip``` is still not rendered above the content you want it to, you can attach it to the ```Window``` instead of the ```Activity``` using:\n" +
            "\n" +
            "    .attachToWindow()\n" +
            "\n" +
            "This will create a dedicated ```Window``` just for the ```TutorialTooltip``` and (should) always render above other content.\n" +
            "When using this method you can only show one ```TutorialTooltip``` at a time though and onClick handling works a little different, so you should only use this as a last resort.\n" +
            "\n" +
            "---\n" +
            "---\n" +
            "---\n" +
            "\n" +
            "# Attributions\n" +
            "\n" +
            "I want to give a big shoutout to Alessandro Crugnola ([sephiroth74](https://github.com/sephiroth74 \"sephiroth74 GitHub Profile\")) who has built his great [android-target-tooltip](https://github.com/sephiroth74/android-target-tooltip \"android-target-tooltip on GitHub\") library that adresses the same issue. His work greatly impacted the way I am building this library and really helped me figure out how to do things right.\n" +
            "\n" +
            "\n" +
            "# License\n" +
            "\n" +
            "    Copyright (c) 2016 Markus Ressel\n" +
            "    \n" +
            "    Licensed under the Apache License, Version 2.0 (the \"License\");\n" +
            "    you may not use this file except in compliance with the License.\n" +
            "    You may obtain a copy of the License at\n" +
            "    \n" +
            "    http://www.apache.org/licenses/LICENSE-2.0\n" +
            "    \n" +
            "    Unless required by applicable law or agreed to in writing, software\n" +
            "    distributed under the License is distributed on an \"AS IS\" BASIS,\n" +
            "    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n" +
            "    See the License for the specific language governing permissions and\n" +
            "    limitations under the License."
    }
}