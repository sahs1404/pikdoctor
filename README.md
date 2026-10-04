# Pik Doctor (पीक डॉक्टर)

**An offline crop-leaf disease checker for Maharashtra farmers, in Marathi, Hindi and English.**

**Challenge 4: Small AI for Development — Agriculture Track**

[Live Demo](https://pikdoctor.vercel.app)

A farmer photographs a leaf (or picks one from the gallery), and **the phone itself** estimates what the problem probably is, how urgent it is, what to do now, and when to seek expert help.

Pik Doctor is designed for the reality of rural agriculture: **limited connectivity, limited technical literacy, and the need for actionable advice rather than just a disease name.**

After the first visit, **the app works without internet, without a server and without an account**. The model, advice and app are cached on the device.

---

## 🌱 What Pik Doctor Does

A farmer can:

- 📷 Take a photo of a leaf or choose one from the gallery
- 🌾 Choose from the supported crops, or let the model identify the condition without a crop selection
- 🩺 Get a likely disease / healthy result
- 🚦 See how urgent the result is through simple visual indicators
- 🔊 Hear the result and advice aloud
- 🗑️ See simple, icon-based steps for **what to do now**
- 📞 Call an agriculture expert / KVK for further help
- 🏪 Show a diagnosis card to a local agro-input shopkeeper
- 💬 Share the result through WhatsApp when connectivity is available
- 📷 Immediately scan another leaf
- 📖 Expand **More information** for additional guidance
- ❓ Get **"not sure"** rather than a confident answer when the model is uncertain
- 🚫 Get **"not a covered crop"** when the image belongs to an unsupported crop

The goal is not to replace an agriculture expert.

**Pik Doctor is a screening and triage tool that helps a farmer decide what to do next.**

---

## 🌾 Crops & Conditions

Current supported crops:

- Tomato
- Grape — with a focus on the Nashik context
- Maize
- Potato
- Bell pepper

The model covers **23 leaf conditions**, including diseases and healthy leaves.

The app also includes an **"other / not covered"** class so that it can refuse unsupported crop leaves instead of confidently forcing them into a known disease class.

---

## 🧠 The Key Idea: It Knows When Not to Guess

One of the most important design decisions in Pik Doctor came from a failure.

During testing, an **apple leaf was incorrectly classified as tomato late blight with high confidence**.

A normal classifier would simply return its most likely class.

For an agricultural application, that is dangerous: a confident but wrong disease recommendation can lead to unnecessary treatment or crop damage.

So we changed the system to explicitly handle **out-of-scope leaves**.

The final pipeline can therefore produce:

> **A diagnosis**  
> **Not sure**  
> **Not a covered crop**

Rather than forcing every image into one of the known conditions.

On our held-out other-crop test set, **97.5% of other-crop leaves were correctly refused as "not covered."**

This is not just a model feature.

**It is a safety feature.**

---

## 📊 Results

All reported model results below are from held-out test images that were **never used for training or tuning**.

| Measure | Result |
|---|---:|
| Accuracy, 23 classes, crop not chosen | **94.7%** |
| Accuracy when farmer picks the crop | **96.2%** |
| Accuracy on answers the model commits to (confidence ≥ 70%, 89% of photos) | **98.3%** |
| Diseased leaf incorrectly called "healthy" — crop not chosen | **0.6%** |
| Diseased leaf incorrectly called "healthy" — crop chosen | **0.2%** |
| Other-crop leaves correctly refused as "not covered" | **97.5%** |
| Model size | **~3 MB** |
| Inference time | **~0.4 s** on a desktop-class CPU |

Full per-class metrics:

`docs/metrics.json`

Training log:

`docs/train_log.txt`

---

## 📱 Designed for the Farmer, Not the Model

The interface is deliberately designed around **large buttons, visual cues, icons and spoken guidance** rather than requiring the farmer to read technical information.

### Simple result communication

Instead of exposing probabilities such as:

`87.4% confidence`

the interface communicates the result using:

- visual urgency indicators
- simple language
- icons
- short action steps
- voice output

### "आजच कृती करा" — What to do now

Every committed diagnosis gives the farmer immediate next steps.

For example:

- remove and destroy affected leaves
- follow appropriate crop-management practices
- seek expert guidance before spraying
- avoid acting on an uncertain diagnosis

The app deliberately avoids giving pesticide names, brands or doses.

### Talk to a person

When the model is uncertain, or when treatment decisions require expertise, Pik Doctor directs the farmer towards human assistance.

The interface provides:

- 📞 **Call an agriculture expert / KVK**
- 🏪 **Show the diagnosis to the shopkeeper**
- 💬 **Share the result through WhatsApp**

This makes Pik Doctor a **bridge to agricultural support**, rather than an AI attempting to replace it.

---

## 🔒 Safety by Design

Pik Doctor follows several conservative rules:

### 1. Low confidence → "Not sure"

If confidence is below the configured threshold, the app does not present a diagnosis as certain.

It instead asks the farmer to retake the photograph and provides the best available possibilities.

### 2. Unsupported crop → "Not covered"

The system includes a trained "other" class to reject leaves outside the supported crop set.

### 3. No pesticide prescriptions

Pik Doctor gives **general integrated-management guidance**.

It does not prescribe:

- pesticide brands
- pesticide doses
- chemical mixtures

The farmer is directed to a KVK or agriculture officer for treatment decisions.

### 4. Human escalation

The app provides direct access to agricultural support instead of pretending that a small offline model can replace an expert.

### 5. No image upload required

Inference happens locally on the device.

**The leaf image does not need to be uploaded to a server for diagnosis.**

---

## ⚙️ How It Works

```text
                     ┌──────────────────┐
                     │  Take / choose   │
                     │   leaf photo     │
                     └────────┬─────────┘
                              ↓
                     ┌──────────────────┐
                     │  Centre crop +   │
                     │  resize to 72 px │
                     └────────┬─────────┘
                              ↓
                     ┌──────────────────┐
                     │   0.75M CNN      │
                     │   Plain JS       │
                     └────────┬─────────┘
                              ↓
                  ┌─────────────────────────┐
                  │ Temperature-calibrated │
                  │       softmax           │
                  └────────────┬────────────┘
                               ↓
                    ┌────────────────────┐
                    │ Confidence ≥ 70% ? │
                    └───────┬───────┬────┘
                            │ YES   │ NO
                            ↓       ↓
                       Diagnosis   "Not sure"
                            │       │
                            ↓       ↓
                    Action + voice  Retake photo
                    + expert help   + expert help
