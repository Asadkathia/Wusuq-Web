# Forms Region, District, City, and Police Station Export

Generated on 2026-04-12.

This export is derived from the non-judicial forms and their backing source files:
- `resources/views/services/copyOfFir.blade.php`
- `resources/views/services/registry.blade.php`
- `resources/views/services/nonjudicial.blade.php`
- `app/Http/Controllers/ServicesController.php`
- `database/seeders/ProvinceSeeder.php`
- `database/seeders/DivisionSeeder.php`
- `database/seeders/DistrictSeeder.php`
- `database/seeders/CitySeeder.php`
- `database/seeders/DistrictStationsSeeder.php`

## Important Notes

- Regions in the forms are the `Province` records.
- Districts are form-selectable by province through `GET /getDistricts/{provinceId}`.
- Cities in the registry/deed form are stored only province-wise (`cities.province_id`). The repo does not contain a district foreign key for cities, so there is no authoritative district-wise city mapping to extract from the forms.
- Police stations in the FIR form are stored only district-wise (`district_police_stations.district_id`). The repo does not contain a city foreign key for police stations, so there is no authoritative city-wise police-station mapping to extract from the forms.
- The FIR form only shows the police-station dropdown for `Punjab` and `KPK`. For the remaining provinces, the UI hides the dropdown and uses free-text `other_station_id` instead.
- The district source used by the form excludes `Karachi East`, `Karachi West`, and `Karachi South`.

## Summary

- Regions / provinces: 7
- Form-selectable districts: 155
- Registry/deed city options: 583
- FIR police-station dropdown options (Punjab + KPK only): 1140

## Regions

- Punjab
- KPK
- Sindh
- Balochistan
- Azad Kashmir
- Gilgit-Baltistan
- Capital

## Districts Region-wise

### Punjab

Count: 36

- Attock
- Bahawalpur
- Bhakkar
- Bhawalnagar
- Chakwal
- Chiniot
- Dera Ghazi Khan
- Faisalabad
- Gujranwala
- Gujrat
- Hafizabad
- Jhang
- Jhelum
- Kasur
- Khanewal
- Khushab
- Lahore
- Layyah
- Lodhran
- Mandi Bahauddin
- Mianwali
- Multan
- Muzaffargarh
- Nankana Sahib
- Narowal
- Okara
- Pakpattan
- Rahim Yar Khan
- Rajanpur
- Rawalpindi
- Sahiwal
- Sargodha
- Sheikhupura
- Sialkot
- Toba Tek Singh
- Vehari

### KPK

Count: 35

- Abbottabad
- Bajaur
- Bannu
- Batagram
- Buner
- Charsadda
- Dera Ismail Khan
- Hangu
- Haripur
- Karak
- Khyber
- Kohat
- Kolai Palas
- Kurram
- Lakki Marwat
- Lower Chitral
- Lower Dir
- Lower Kohistan
- Malakand Protected Area
- Mansehra
- Mardan
- Mohmand
- North Waziristan
- Nowshera
- Orakzai
- Peshawar
- Shangla
- South Waziristan
- Swabi
- Swat
- Tank
- Torghar
- Upper Chitral
- Upper Dir
- Upper Kohistan

### Sindh

Count: 26

- Badin
- Dadu
- Ghotki
- Hyderabad
- Jacobabad
- Jamshoro
- Kambar/Shahdad Kot
- Karachi Central
- Kashmor
- Khairpur
- Korangi
- Larkana
- Malir
- Matiari
- Mirpur Khas
- Naushahro Feroze
- Sanghar
- Shaheed Benazirabad
- Shikarpur
- Sujawal
- Sukkur
- Tando Allahyar
- Tando Muhammad Khan
- Tharparkar
- Thatta
- Umerkot

### Balochistan

Count: 33

- Awaran
- Barkhan
- Chagai
- Dera Bugti
- Duki
- Gwadar
- Harnai
- Jaffarabad
- Jhal Magsi
- Kachhi
- Kalat
- Kech
- Kharan
- Khuzdar
- Killa Abdullah
- Killa Saifullah
- Kohlu
- Lasbela
- Loralai
- Mastung
- Musakhel
- Nasirabad
- Nushki
- Panjgur
- Pishin
- Quetta
- shaheed sikandarabad
- Sherani
- Sibi
- Sohbatpur
- Washuk
- Zhob
- Ziarat

### Azad Kashmir

Count: 10

- Bagh
- Bhimber
- Hattian Bala
- Haveli
- Kotli
- Mirpur
- Muzaffarabad
- Neelum
- Poonch/Rawalkot
- Sudhnutti/Pulandri

### Gilgit-Baltistan

Count: 14

- Astore
- Darel
- Diamer
- Ghanche
- Ghizer/Khizer
- Gilgit
- Gupis Yasin
- Hunza
- Kharmang
- Nagar
- Roundu
- Shigar
- Skardu
- Tangir

### Capital

Count: 1

- Islamabad

## Cities From Forms

The registry/deed form renders these exact city options, grouped by province because that is how the source data is modeled.

### Punjab

Count: 144

- Ahmadpur East
- Ahmedpur Sial
- Ali Pur Chattha
- Alipur
- Arifwala
- Athara Hazari
- Attock
- Bahawalnagar
- Bahawalpur
- Bhakkar
- Bhalwal
- Bhawana
- Bhera
- Burewala
- Chak Jhumra
- Chakwal
- Chaubara
- Chichawatni
- Chiniot
- Chishtian
- Choa Saidan Shah
- Chowk Sarwar Shaheed
- Chunian
- Dajal
- Darya Khan
- Daska
- Depalpur
- Dera Ghazi Khan
- Dina
- Dunyapur
- Faisalabad
- Fateh Jang
- Firozwala
- Fort Abbas
- Gojra
- Gujar Khan
- Gujranwala
- Gujrat
- Hafizabad
- Haroonabad
- Hasilpur
- Hassan Abdal
- Hazro
- Isa Khel
- Jalal pur Jattan
- Jalalpur Pirwala
- Jampur
- Jand
- Jaranwala Town
- Jatoi
- Jehanian
- Jhang
- Jhelum
- Kabirwala
- Kahror Pakka
- Kahuta
- Kallar Kahar
- Kallar Syedan
- Kalur Kot
- Kamalia
- Kamoke
- Karor Lal Esan
- Kasur
- Khairpur Tamewali
- Khanewal
- Khanpur
- Kharian
- Khushab/Joharabad
- Koh-e-Suleman
- Kot Addu
- Kot Chutta
- Kot Momin
- Kot Radha Kishan
- Kotli Sattian
- Kunjah
- Lahore
- Lahore Cantt
- Lahore Model Town
- Lalian
- Lawa
- Layyah
- Liaquatpur
- Lodhran
- Mailsi
- Malakwal
- Mandi Bahauddin
- Mandi Shah Jeewna
- Mankera
- Mian Channu
- Mianwali
- Minchinabad
- Muhammadpur
- Multan
- Murree
- Muzaffargarh
- Nankana Sahib
- Narowal
- Nowshehra/Waadi-e-Soon
- Nowshera Virkan
- Nurpur Thal
- Okara
- Pakpattan
- Pasrur
- Pattoki
- Phalia
- Pind Dadan Khan
- Pindi Bhattian
- Pindi Gheb
- Piplan
- Pir Mahal
- Quaidabad
- Rahim Yar Khan
- Rajanpur
- Rawalpindi
- Renala Khurd
- Rojhan
- Sadiqabad
- Safdarabad
- Sahiwal
- Sahiwal
- Sambrial
- Sammundri Town
- Sangla Hill
- Sarai Alamgir
- Sargodha
- Shahkot
- Shahpur
- Shakargarh
- Sheikhupura
- Shorkot
- Shujabad
- Sialkot
- Sillanwali
- Sohawa
- Talagang
- Tandlianwala Town
- Taunsa Sharif
- Taxila
- Toba Tek Singh
- Vehari
- Vehova
- Wazirabad
- Yazman
- Zafarwal

### KPK

Count: 125

- Abbottabad
- Adenzai
- Adenzai
- Allai
- Alpuri
- Alpuri
- Awaran
- Awaran
- Babuzai (Swat)
- Babuzai (Swat)
- Balakot
- Banda Daud Shah
- Bannu
- Barikot
- Barikot
- Batagram (Banna)
- Behrain
- Behrain
- Chagharzai
- Chagharzai
- Chamla
- Chamla
- Charbagh
- Charbagh
- Charsadda
- Charsadda
- Chitral
- Chitral
- Daggar (Buner)
- Daggar (Buner)
- Daraban
- Dassu
- Dera Ismail Khan
- Dir
- Dir
- Domel
- Gadezai
- Gadezai
- Gagra
- Gagra
- Ghazi
- Gishkore
- Gishkore
- Hangu
- Haripur
- Havelian
- Jahangira
- Jahangira
- Jhal Jhao
- Jhal Jhao
- Kabal
- Kabal
- Kandia
- Karak
- Katlang
- Katlang
- Khwaza Khela
- Khwaza Khela
- Kohat
- Kohat
- Korak Jahoo
- Korak Jahoo
- Kulachi
- Lachi
- Lachi
- Lahor
- Lahor
- Lakki Marwat
- Lal Qila
- Lal Qila
- Mansehra
- Mardan
- Mardan
- Mashkai
- Mashkai
- Mastuj
- Mastuj
- Matta Shamzai
- Matta Shamzai
- Mingora
- Naurang
- Nowshera
- Nowshera
- Oghi
- Pabbi
- Pabbi
- Paharpur
- Palas
- Paroa
- Pattan
- Peshawar
- Puran
- Puran
- Razar
- Razar
- Rustam
- Rustam
- Sam Ranizai
- Sam Ranizai
- Samarbagh (Barwa)
- Samarbagh (Barwa)
- Shabqadar
- Shabqadar
- Sharingal
- Sharingal
- Swabi
- Swabi
- Swat Ranizai
- Swat Ranizai
- Takht Bhai
- Takht Bhai
- Takht-E-Nasrati
- Tall
- Tangi
- Tangi
- Tank
- Temergara
- Temergara
- Topi
- Topi
- Tor Ghar
- Totalai
- Totalai
- Wari
- Wari

### Sindh

Count: 113

- Badin
- Bakrani
- Bhiria
- Bulri Shah Karim
- Chachro
- Chamber
- Dadu
- Daharki
- Daulatpur (Qazi Ahmed)
- Daur
- Dhali
- Digri
- Diplo
- Dokri
- Faiz Ganj
- Gambat
- Garhi Khairo
- Garhi Yasin
- Ghorabari
- Ghotki
- Golarchi
- Hala
- Hussain Bux Marri
- Hyderabad
- Islamkot
- Jacobabad
- Jam Nawaz Ali
- Jamshoro
- Jati
- Jhando Mari
- Jhuddo
- Johi
- Kaloi
- Kambar
- Kandhkot
- Kandioro
- Karachi Central
- Karachi East
- Karachi South
- Karachi West
- Kashmore
- Keti Bunder
- Khairpur
- Khairpur Nathan Shah
- Khangarh (Khanpur)
- Khanpur
- Kharo Chan
- Khipro
- Kingri
- Kot Diji
- Kot Ghulam Mohammad
- Kotri
- Kubo Saeed Khan
- Kunri
- Lakhi
- Larkana
- Latifabad
- Malir
- Manjhand
- Matiari
- Matli
- Mehar
- Mehrabpur
- Miro Khan
- Mirpur Bathoro
- Mirpur Khas
- Mirpur Mathelo
- Mirpur Sakro
- Mithi
- Moro
- Nagarparkar
- Nara
- Nasirabad
- Naushahro Feroze
- Nawabshah
- Pano Aqil
- Pithoro
- Qasimabad
- Rato Dero
- Rohri
- Saeedabad
- Sakrand
- Salehpat
- Samaro
- Sanghar
- Sehwan Sharif
- Shah Bunder
- Shahdadkot
- Shahdadpur
- Shaheed Fazal Rahu
- Shikarpur
- Shujabad
- Sindhri
- Sinjhoro
- Sobhodero
- Sujawal
- Sujawal Junejo
- Sukkur
- Talhar
- Tando Adam
- Tando Allahyar
- Tando Bago
- Tando Ghulam Hyder
- Tando Mohammad Khan
- Tangwani
- Thano Bula Khan
- Thari Mirwah
- Thatta
- Thul
- Ubauro
- Umerkot
- Uthman Kot
- Warah

### Balochistan

Count: 136

- Aranji
- Ashwat
- Baba Kot
- Badini
- Baghbana
- Baiker
- Balanari
- Balnigor
- Barkhan
- Barshore
- Bela
- Besima
- Bhag
- Bori
- Buleda
- Chagai
- Chaman
- Chattar
- Chiltan
- Dak
- Dalbandin
- Dasht
- Dasht
- Dera Bugti
- Dera Murad Jamali
- Dhadar
- Dobani
- Drug
- Duki
- Dureji
- Faridabad
- Gaddani
- Gandakha
- Gandawa
- Gazg
- Gichk
- Gowargo
- Greshek
- Grisini
- Gulistan
- Gwadar
- Harnai
- Hayrvi
- Hoshab
- Hub
- Hurramzai
- Jhal Magsi
- Jhat Pat
- Jiwani
- Johan
- Kahan
- Kalat
- Kanmetharzai
- Kanraj
- Karakh
- Karezat
- Kashatu
- Khad Koocha
- Kharan
- Khattan
- Khoast
- Khuzdar
- Killa Abdullah
- Killa Saifullah
- Kingri
- Kirdgap
- Kohlu
- Kutmandai
- Lakhra
- Lehri
- Liari
- Loiband
- Loralai
- Loti
- Mach
- Maiwand
- Malam
- Mand
- Mangochar
- Manjipur
- Mashkhel
- Mastung
- Mekhtar
- Mirpur
- Moola
- Musakhel
- Muslim Bagh
- Nag
- Nall
- Nokundi
- Nushki
- Ormara
- Ornach
- Panjgur
- Panjpai
- Paroom
- Pasni
- Phelawagh
- Pir Koh
- Pishin
- Qamar Din Karez
- Quetta
- Sambaza
- Sangan
- Sangsillah
- Sanni
- Sar-Kharan
- Saranan
- Saroona
- Shahgori
- Sharigh
- Sherani
- Shinki
- Sibi
- Sinjavi
- Sohbatpur
- Sonmiani (Winder)
- Sui
- Suntsar
- Surab
- Taftan
- Tamboo
- Tamboo
- Tohumulk
- Toisar
- Tump
- Turbat
- Usta Mohammad
- Uthal
- Wadh
- Washuk
- Zamuran
- Zarghoon
- Zehri
- Zhob
- Ziarat

### Azad Kashmir

Count: 34

- Abbaspur
- Ath Muqam
- Azad Kashmir
- Bagh
- Baloch
- Barnala
- Bhimber
- Charoi
- Chikar
- Dheerkot
- Dudyal
- Dulia Jattian
- Fateh Pur Thakiala (Nakial)
- Garhi Dopatta (Garhi Dopatta)
- Hajeera
- Hari Gehal
- Hattian Bala
- Haveli
- Khui Rtta
- Khurshid Abad
- Kotli
- Lipa
- Mang
- Mirpur
- Mumtazabad
- Muzaffarabad
- Pallandari
- Patehka (Nasirabad)
- Rawalakot
- Samahni
- Sehnsa
- Sharda
- Tarar Khal
- Thorar

### Gilgit-Baltistan

Count: 30

- Aliabad
- Astore
- Babusar
- Chalt
- Chilas
- Chorbut
- Daghoni
- Danyor
- Darel
- Gamba
- Gilgit
- Gojal
- Gultari
- Gupis
- Haldi
- Ishkoman
- Juglot
- Keris
- Khaplu
- Kharmang
- Mashabrum
- Nagar
- Phander
- Punial
- Rondu
- Shigar
- Shounter
- Skardu
- Tangir
- Yasin

### Capital

Count: 1

- Islamabad

## Police Stations From Forms

The FIR form renders police-station dropdown options only for Punjab and KPK, and those options are loaded district-wise.

### Punjab

#### Attock

Count: 17

- ANF
- Anti Corruption
- Attock Khurd
- Basal
- Bathar
- City Attock
- City Hassan Abdal
- Fateh Jang
- Hazro
- Injra
- Jand
- New Air port
- Pindigheb
- Railway
- Rangoo
- Saddar Attock
- Saddar Hassan Abdal

#### Bahawalpur

Count: 30

- Abbas Nagar
- Anit Corruption
- Baghdad-ul-Jadeed
- Cantt.
- Chani Goth
- Chowki Railway Ahmadpur East
- City Ahmadpur East
- City Hasilpur
- City Yazman
- Civil Lines
- Dera Nawab Sahib
- Derawar
- Dhoor Kot
- FIA
- Head Rajkan
- Inayati
- Khairpur Tamewali
- Kotwali
- Musafir Khana
- Nowshehra Jadid
- Qaimpur
- Railway Bahawalpur
- Railway Khanpur
- Railway Samma Satta
- Saddar Ahmadpur East
- Saddar Bahawalpur
- Saddar Hasilpur
- Saddar Yazman
- Samma Sattta
- Uch Sharif

#### Bhakkar

Count: 14

- Anti Corruption Bhakkar
- Behal Bhakkar
- Chandni Chowk
- City Bhakkar
- City Darya Khan
- Dullewala
- Haidarabad
- Jandanwala
- Kalur Kot
- Mankaira
- Railway Bhakkar
- Saddar Bhakkar
- Saddar Darya Khan
- Sara-e-Mohajar

#### Bhawalnagar

Count: 26

- Anti Corruption
- Bakhshan Khan
- Bakhshan Khan
- CIA
- City A/Division Bahawalnagar
- City A/Division Chishtian
- City B/Division Bahawalnagar
- City B/Division Chishtian
- City Haroonabad
- Dahranwala
- Dunga Bunga
- Faqirwali
- Fortabbas
- Ghumand Pur
- Khichiwala
- Maclod Gunj
- Madrassa
- Mandi Sadiq Gunj
- Maroot
- Minchinabad
- Railway
- Saddar Bahawalnagar
- Saddar Chishtian
- Saddar Haroonabad
- Shaher Fareed
- Takht Mahal

#### Chakwal

Count: 11

- Choa Saidan Shah
- City Chakwal
- City Talagang
- Dhudial
- Duhman
- Kallar Kahar
- Lawa
- Neela
- Saddar Chakwal
- Saddar Talagang
- Tamman

#### Chiniot

Count: 12

- Bhowana
- Chenab Nagar
- City
- City Chiniot
- Kanidwal
- Kot Wasawa
- Lalian
- Langrana
- Muhammad Wala
- Railway Police Post
- Rajoya
- Saddar  Chiniot

#### Dera Ghazi Khan

Count: 23

- Anti-Corruption
- B-Division
- BMP Post D.G.Khan
- BMP Post Taunsa Sharif
- Choti
- City
- City, Taunsa Sharif
- Civil Line
- Darhama
- Darkhast Jamal Khan
- FIA
- Gaddai
- Jhoke Utra
- Kala
- Kot Chutta
- Kot Mubarak
- Railway
- Raitra
- Saddar
- Saddar, Taunsa Sharif
- Sakhi Sarwar
- Shah Saddar Din
- Vehova

#### Faisalabad

Count: 50

- ANF
- Anti-Corruption
- ATA
- Bahlak
- Balochni
- Batala Colony
- Buchiana
- Chak Jhumra
- Civil Lines
- D-Type Colony
- Dijkot
- F.I.A.
- Factory Area
- FEDMC
- G. M. Abad
- Garh
- Gulberg
- Jaranwala City
- Jaranwala Sadar
- Jhang Bazar
- Khurrianwala
- Kotwali
- Kurr
- Lundianwala
- Madina Town
- Mamukanjan
- Mansoor Abad
- Millat Town
- Muridwala
- Nishat Abad
- Peoples Colony
- Rail Bazar
- Railway
- Railway Jaranwala
- Raza Abad
- Rodala Road
- Roshanwala
- Sadar
- Sahianwala
- Samanabad
- Samundri City
- Samundri Sadar
- Sandal Bar
- Sargodha Road
- Satiana
- Tandlianwala City
- Tandlianwala Sadar
- Tarkhani
- Thikriwala
- Women

#### Gujranwala

Count: 36

- Ahmad Nagar
- Ali Pur
- Anti Corruption
- Aroop
- Baghbanpura
- Cantt
- CIA
- City Kamoke
- City Wazirabad
- Civil Line
- CTD
- Dhullay
- Eminabad
- Ferozewala
- FIA
- Garjakh
- Ghakhar Mandi
- Jinnah Road
- Khiali
- Kot Ladha
- Kotwali
- Ladhewala Waraich
- Model Town
- Noushera Virkan
- Peoples Colony
- Police Line Gujranwala
- Qilla Dedar Singh
- Railway
- Sabzi Mandi
- Sadar Gujranwala
- Sadar Kamoke
- Sadar Wazirabad
- Satellite Town
- Sohdra
- Tatlay Aali
- Wahndo

#### Gujrat

Count: 28

- A/Division
- Anti Corruption
- B/Division
- Bolani
- City Jalalpur Jattan
- City Lalamusa
- City Sarai Alamgir
- Civil Line
- Daulat Nagar
- Dinga
- FIA
- Guliana
- Industrial Estate Phase 2
- Kakrali
- Karianwala
- Kharian Cantt.
- Kunjah
- Larry Adda
- Mangowal
- Railway
- Rehmania
- Sadar Gujrat
- Sadar Jalapur Jattan
- Sadar Kharian
- Sadar Lalamusa
- Sadar Sarai Alamgir
- Shaheen Chowk
- Tanda

#### Hafizabad

Count: 10

- CITY HAFIZABAD
- CITY PINDI BHATTIAN
- JALAL PUR BHATTIAN
- KALEKE MANDI
- KASESAY
- KASOKE
- SADAR HAFIZABAD
- SADAR PINDI BHATTIAN
- SUKHEKE MANDI
- VENEKE TARAR

#### Jhang

Count: 15

- 18-Hazari
- Ahmad Pur Sial
- City Jhang
- City Shorkot
- Garh Maharaja
- Kot Shakir
- Kotwali
- Massan
- Mochiwala
- Qadir Pur
- Railway
- Sadar Jhang
- Satellite Town
- Shorkot Cannt.
- Waryam

#### Jhelum

Count: 14

- ANF Dina
- Chotala
- City
- Civil Lines
- Dina
- Domeli
- Jalalpur Sharif
- Kala Gujran
- Lilla
- Mangla Cantt
- Pind Dadan Khan
- Railway
- Saddar
- Sohawa

#### Kasur

Count: 22

- A Division
- Allahabad
- Anti Corruption
- B Division
- Changa Manga
- City Chunian
- City Pattoki
- City Phool Nagar
- Ganda Singh Wala
- Kanganpur
- Khudian
- Kot Radha Kishan
- Mandi Usman Wala
- Mustafabad
- Railway Kasur
- Raja Jang
- Sadar Chunian
- Sadar Kasur
- Sadar Pattoki
- Sadar Phool Nagar
- Sarai Mughal
- Theh Sheikhum

#### Khanewal

Count: 21

- Abdul Hakeem
- Adda Baara Meel
- Chab kallan
- City Jehanian
- City Kabirwala
- City Khanewal
- City Mianchannu
- Hawaili koranga
- Kacha Kho
- Kohna
- Makhdoom Pur
- Nawan Shehar
- Railway Kabirwala
- Railway Khanewal
- Railway Mianchannu
- Saddar Kabirwala
- Saddar Khanewal
- Saddar Mianchannu
- Sirae Saddhu
- Thatha Sadiq Abad
- Tulamba

#### Khushab

Count: 9

- City Jauharabad
- Jaura Kalan
- Katha Saghral
- Khushab
- Mitha Tiwana
- Naushera
- Noorpur Thal
- Quaidabad
- Saddar Jauharabad

#### Lahore

Count: 92

- Akbri Gate
- Anti Corruption
- Anti Narcotics Force
- Badami Bagh
- Baghbanpura
- Barki
- Batapur
- Bhatti Gate
- Chung
- CIA
- Civil Line
- Custom House Cell
- Data Darbar
- Defence A
- Defence B
- Defence C
- Factory Area
- Faisal Town
- FIA
- Garden Town
- Garhi Shahu
- Gawal Mandi
- Ghalib Market
- Ghazia Abad
- Green Town
- Gujjar Pura
- Gulberg
- Gulshan Iqbal
- Gulshan Ravi
- Hair
- Hanjarwal
- Harbanspura
- Hydyara
- Ichhra
- Iqbal Town
- Islam Pura
- Johar Town
- Kahna
- Kot Lakhpat
- Lady Race Course
- Larry Adda
- Liaqat Abad
- Lohari Gate
- Lower Mall
- Lyttan Road
- Manawan
- Manga Mandi
- Masti Gate
- Millat Park
- Misri Shah
- Mochi Gate
- Model Town
- Mozang
- Mughalpura
- Muslim Town
- Mustafa Abad
- Mustafa Town
- Naseer Abad
- Nawab Town
- Nawan Kot
- New Anarkali
- Nishter Colony
- North Cantt.
- Noulakha
- Old Anarkali
- Qilla Gujjar Singh
- Quaid e Azam Industrial Area
- Race Course
- Railway Lahore
- Railway Mughalpura
- Railway Raiwind
- Raiwind
- Rang Mahal
- Ravi Road
- Sabzazar
- Samanabad
- Sanda
- Sarwar Road
- Sattokatla
- Shad Bagh
- Shadman
- Shafique Abad
- Shahdara
- Shahdara Town
- Shalimar
- Shera Kot
- South Cantt.
- Sundar
- Tibi City
- Town Ship
- Wahdat Colony
- Yakki Gate

#### Layyah

Count: 11

- Anti Corruption
- Choubara
- Chowk Azam
- City Layyah
- Fateh Pur
- FIA
- Karor
- Kot Sultan
- Peer Jaggi
- Railway
- Saddar Layyah

#### Lodhran

Count: 11

- City Dunya Pur
- City Kehror Pacca
- City Lodhran
- Dhanote
- Galley Wal
- Jalla Arain
- Qureshi Wala
- Railway
- Saddar Dunya Pur
- Saddar Kehror Pacca
- Saddar Lodhran

#### Mandi Bahauddin

Count: 12

- Bhagat
- City M.B.Din
- Civil Line
- Gojra
- Kuthiala Sheikhan
- Malakwal
- Miana Gondal
- Pahrianwali
- Phalia
- Qadirabad
- Railway
- Sadar M.B.Din

#### Mianwali

Count: 22

- ANF
- Anti Corruption
- Bhangi Khel
- Chakrala
- Chapri
- Chidru
- City
- Daud Khel
- Easa Khel
- Harnoli
- Kala Bagh
- Kamar Mushani
- Kundian
- Makrwal
- Mochh
- Musa Khel
- Pai Khel
- Phir Pehai
- Piplan
- Railway
- Sadar
- Wan Bachran

#### Multan

Count: 37

- Alpha
- ANF
- Anti-Corruption
- Bahauddin Zakriya
- Basti Malook
- Bohar Gate
- Budhla Sant
- Cantt Multan
- Chehliyak
- City Jalalpur Pirwala
- City Shujabad
- Custom
- Dehli Gate
- Dolat Gate
- FIA
- Gulgasht
- Haram Gate
- Jaleelabad
- Kup
- Lohari Gate
- Makhdoom Rasheed
- Mumtazabad
- Muzafarabad
- New Multan
- Old Kotwali
- Pak Gate
- Qadir Pur Ran
- Qutab Pur
- Railway
- Rajaram (Shujabad)
- Saddar Jalalpur Pirwala
- Saddar Multan
- Saddar Shujabad
- Seetal Marri
- Shah Rukne Alam
- Shah Shamas
- Women Police Center

#### Muzaffargarh

Count: 26

- Anti Corruption
- Bait Mir Hazar
- City Ali Pur
- City Muzaffargarh
- Civil Lines
- Daira Din Panah
- Jatoi
- Khairpur Sadaat
- Khangarh
- Kot Addu
- Kot Addu Saddar
- Kundai
- Mehmood Kot
- Qasba Gujrat
- Qureshi
- Railway
- Rangpur
- Rohilanwali
- Saddar Alipur
- Saddar Muzaffargarh
- Sanawan
- Sarwar Shaheed
- Sarwar Shaheed Saddar
- Seetpur
- Shah Jamal
- Shehr Sultan

#### Nankana Sahib

Count: 13

- Barra Ghar
- City Nankana Sahib
- City Sangla Hill
- City Shahkot
- Mandi Faiz Abad
- Mangtawala
- Railway Chuki Sangle Hill
- Railway Jaranwala
- Saddar Nankana Sahib
- Saddar Sangla Hill
- Saddar Shahkot
- Syed wala
- Warbartan

#### Narowal

Count: 16

- Ahmad Abad
- Anti Corruption
- Baddo Malhi
- Chak Amru
- City Narowal
- City Shakargarh
- Kot Nainan
- Lessar Kalan
- Niddoke
- Noor Kot
- Railway Police Post
- Rayya Khas
- Saddar  Shakargarh
- Saddar Narowal
- Shah Gharib
- Zafarwal

#### Okara

Count: 22

- A-Division
- Anti-corruption
- B-Division
- Basirpur
- Cantt Okara
- Chorasta Mian Khan
- Chuchak
- City Depalpur
- City Renala Khurd
- Gogera
- Haveli Lakha
- Hujra Shah Muqeem
- Mandi Ahmad Abad
- Railway Police Post, Basirpur
- Railway Police Post, Okara
- Ravi
- Sadar Depalpur
- Sadar Renala Khurd
- Saddar Okara
- Satghara
- Shahbore
- Shergarh

#### Pakpattan

Count: 14

- Ahmed Yar
- Anti-Corruption
- Chak Bedi
- City Arifwala
- City Pakpattan
- Dal Waryam
- Farid Nagar
- Kalyana
- Malka Hans
- Qabula Sharif
- Railway Police Post
- Rang Shah
- Saddar Arifwala
- Saddar Pakpattan

#### Rahim Yar Khan

Count: 32

- Aab-e-Hayat
- Abadpur
- Ahmedpur Lama
- Airport
- Anti-Corruption
- Bhong
- Choki Railway RYK
- City A Division
- City B Division
- City C Division
- City Khanpur
- City Liaqatpur
- City Sadiqabad
- FIA
- Iqbalabad
- Islam Garh
- Kot Sabzal
- Kot Samaba
- Machka
- Manthar
- Pacca Laran
- Railway Khanpur
- Rukanpur
- Sadar Sadiqabad
- Saddar Khanpur
- Saddar Liaqatpur
- Saddar Rahim Yar Khan
- Sehja
- Shedani
- Tabassam Shaheed
- Taranda Muhammad Panah
- Zahir Peer

#### Rajanpur

Count: 35

- Bangla Ichaa
- BMP Barra
- BMP Bhandowala
- BMP Chacha
- BMP Dilber
- BMP Dooli
- BMP Harrand
- BMP Jhatro
- BMP Khaan
- BMP Khalchas
- BMP Khumbi
- BMP Kot Rom
- BMP Marri
- BMP Mughal
- BMP Muranj
- BMP Nili Lakri
- BMP Sheikhwala
- City Fazilpur
- City Jampur
- City Rajanpur
- Goth Mazari
- Hajipur
- Hanif Ghauri Shaheed Dajal
- Harrand
- Kot Mithan
- Lal Garh
- Muhammadpur
- Rojhan
- Sabzani
- Saddar Fazilpur
- Saddar Jampur
- Saddar Rajanpur
- Shahwali
- Sonmiani
- Umer Kot

#### Rawalpindi

Count: 39

- ACE
- Airport
- ANF
- Banni
- Cantt.
- Chakri
- Chountra
- City Rawalpindi
- Civil Line
- CTD
- Dhamiyal
- FIA
- Ganjmandi
- Gujar Khan
- Jatli
- Kahuta
- Kallar Syedan
- Kotli Sattian
- Mandra
- Morgah
- Murree
- Naseerabad
- New Town
- Patriata
- Phagwari
- Pir Wadhai
- RA Bazar
- Race Course
- Railway
- Ratta Amral
- Rawat
- Saddar Beroni
- Saddar Wah Cantt.
- Sadiqabad
- Taxila
- Wah Cantt.
- Waris Khan
- Westridge
- Women

#### Sahiwal

Count: 19

- Anti Corruption
- Bahadar Shah
- City Chichawatni
- City Sahiwal
- Civil Line
- Dera Rahim
- Fareed Town
- Fateh Sher
- Ghala Mandi
- Ghaziabad
- Harappa
- Kameer
- Kassowal
- Noor Shah
- Okanwala Bangla
- Railway
- Saddar Chichawatni
- Shah Kot
- Yousafwala

#### Sargodha

Count: 30

- Anti-Corruption
- Atta Shaheed
- Bhagtanwala
- Bhera
- Cantt
- City Bhalwal
- City Sargodha
- Factory Area
- FIA
- Jhal Chakian
- Jhawarian
- Karana
- Kotmomin
- Laksian
- Mela
- Miani
- Midh Ranjha
- Phullarwan
- Railway
- S. Town
- Saddar Bhalwal
- Saddar Sargodha
- Sahiwal
- Sajid Shaheed
- Shahnikdar
- Shahpur City
- Shahpur Saddar
- Sillanwali
- Tirkhanwala
- Urban Area

#### Sheikhupura

Count: 19

- A-Division City
- Anti Corruption
- B-Division City
- Bhikhi
- CIA
- City Farooqabad
- City Muridke
- Factory Area
- Ferozewala
- Housing Colony
- Khanqah Dogran
- Mananwala
- Narang Mandi
- Railway Police
- Sadar Farooqabad
- Sadar Muridke
- Sadar Sheikhupura
- Safdarabad
- Sharqpur Sharif

#### Sialkot

Count: 30

- Airport
- ANF
- Anti Corruption
- Badiana
- Bambhanwala
- Begowala
- Cantt
- City Daska
- City Pasrur
- Civil Line
- Haji Pura
- Head Marala
- Kotli Loharan
- Kotli Said Mir
- Kotowali
- Motra
- Murad Pur
- Neka Pura
- Phaloura
- Phukliyan
- Qila Kalarwala
- Railway Police
- Rang Pura
- Sabzpir
- Sadar Daska
- Sadar Pasrur
- Sadar Sialkot
- Sambrial
- Satrah
- Ugoki

#### Toba Tek Singh

Count: 12

- Aroti
- Bhussi
- Chuttiana
- City Gojra
- City Kamalia
- City Toba
- Nawan Lahore
- Pir Mehal
- Rajana
- Saddar Gojra
- Saddar Kamalia
- Saddar Toba

#### Vehari

Count: 24

- Adda Jhal Sial
- Anti-Corruption
- City Burewala
- City Mailsi
- City Vehari
- Danewal
- Fateh Shah
- FIA
- Gaggo
- Garah Morh
- Karam Pur
- Ludden
- Machiwal
- Meera Pur
- Mitroo
- Model Town
- Railway
- Saddar Burewala
- Saddar Mailsi
- Saddar Vehari
- Sahuka
- Sheikh Fazil
- Thingi
- Tibba Sultan Pur

### KPK

#### Abbottabad

Count: 12

- Bagnotar
- Bakot
- Cantt
- City
- Havelian
- Lora
- Mirpur
- Nara
- Nathiagali
- Nawansher
- Sherwan
- Women Police Station

#### Bajaur

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Bannu

Count: 12

- Bakka Khel
- Basya Khel
- Cantt
- Domel
- Ghori wala
- Jani Khel
- Johar
- Kaki
- Mairian
- Mandan
- Saddar
- Township

#### Batagram

Count: 6

- Banna
- Battagram
- Changle
- Kuza Banda
- Pazang
- Shamlai

#### Buner

Count: 8

- Chinglai
- Dagger
- Gul bandi
- Jawar
- Nawagai
- Ningarai
- Pir Baba
- Totalai

#### Charsadda

Count: 13

- Battagram
- Charsadda
- Khanmai
- Khawajawas Koroona
- Mandani
- Nisatta
- Prang
- Sardheri
- Shabqadar
- Sro-Killi
- Tangi
- Tarnab
- Umarzai

#### Dera Ismail Khan

Count: 14

- Band Kurai
- Cantt
- Chodwan
- City
- Daraban
- Dera Town
- GomalUniversity
- Kirri Khaisore
- Kulachi
- Paharpur
- Panyala
- Paroa
- Saddar
- Yark

#### Hangu

Count: 5

- Bilyamina
- City Hangu
- Doaba
- Saddar
- Thall

#### Haripur

Count: 10

- Beer
- Cantt
- City
- Ghazi
- Hattar
- K.T.S
- Khanpur
- Kotnajeebullah
- Nara Amazai
- Sarai Saleh

#### Karak

Count: 9

- Bandadaud Shah
- Gurguri
- Karak
- Khuram
- Latambar
- Sabir Abad
- Shah Saleem
- Takhat Nasrati
- Terri

#### Khyber

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Kohat

Count: 11

- Bilitang
- Cantt
- Gumbat
- Jangalkhel
- Jarma
- Kaghazai
- KDA
- Lachi
- Saddar
- Shakardara
- Ustermzai

#### Kolai Palas

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Kurram

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Lakki Marwat

Count: 6

- Dodiwala
- Ghazni Khel
- Lakki
- Naurang
- Pezu
- Tajori

#### Lower Chitral

Count: 12

- Arando
- Ayun
- Bumburate
- Buni
- Chitral
- Darosh
- Koghozi
- Lotkoh
- Mastooj
- Mulkoh
- Shaghoor
- Sher Koh

#### Lower Dir

Count: 13

- Asbnar
- Balambat
- Chakdara
- Hayaserai
- Khal
- Lal Qilla
- Mayar
- Munda
- Ouch
- Samar Bagh
- Talash
- Timergara
- Zimdara

#### Lower Kohistan

Count: 11

- Battera
- Dassu
- Dubair
- Herban
- Jalkot
- Karang
- Komella
- Looter
- Palas
- Pattan
- Sazeen

#### Malakand Protected Area

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Mansehra

Count: 13

- Bafa
- Balakot
- Battale
- Cantt
- City
- Darband
- Garhi Habibullah
- Kaghan
- Khaki
- Lasan Nawab
- Oghi
- Pulra
- Shinkyari

#### Mardan

Count: 17

- Choora
- City
- Garhi Kapura
- Hoti
- Jabbar
- Katlang
- Kharaki
- Lundkhuwar
- Par Hoti
- Rustam
- Saddar
- SaroShah
- ShahbazGarhi
- SheikhMaltoon
- SherGarh
- TakhtBhai
- Toru

#### Mohmand

Count: 0

- No station records in `DistrictStationsSeeder`.

#### North Waziristan

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Nowshera

Count: 8

- AkbarPura
- Akora
- Azakhel
- Nizam pur
- Nowshera Cantt
- Nowshera Kalan
- Pabbi
- Risalpur

#### Orakzai

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Peshawar

Count: 30

- Badaber
- Bannamari
- Chamkani
- Daudzai
- Eastcantt
- Faqirabad
- Gulbahar
- Gulbarg
- Hashtnagri
- Hayatabad
- Kabuli
- Khazana
- Kotwali
- Mathra
- Mattani
- Michni Gate
- Nasirbagh
- Phandu
- Pharipura
- Pishtakhara
- Regi
- Sarband
- Shahqabool
- Suburb
- Tatara
- Tehkal
- UniversityTown
- Urmer
- Westcantt
- Women Police Station

#### Shangla

Count: 7

- Aloch
- Alpuri
- Bisham
- Chakisar
- Kamach
- Karora
- Martong

#### South Waziristan

Count: 0

- No station records in `DistrictStationsSeeder`.

#### Swabi

Count: 9

- I.D.S
- Kalukhan
- Lahor
- Parmoli
- Swabi
- Topi
- Utla
- Yar Hussain
- Zaida

#### Swat

Count: 20

- Banr
- Behrain
- Charbagh
- Chuprail
- Ghaligai
- Kabbal
- Kalakot
- Kalam
- Kanju
- Khwaza Khela
- Kokarai
- Madyan
- Malam Jabba
- Manglawar
- Matta
- Mingora
- Rahimabad
- Sadu Sharif
- Shah Dhari
- Shamozai

#### Tank

Count: 4

- Gomal
- Gul Imam
- Mulazi
- Tank

#### Torghar

Count: 3

- Darbani
- Judbah
- Karor

#### Upper Chitral

Count: 12

- Arando
- Ayun
- Bumburate
- Buni
- Chitral
- Darosh
- Koghozi
- Lotkoh
- Mastooj
- Mulkoh
- Shaghoor
- Sher Koh

#### Upper Dir

Count: 10

- Barawal
- Dir
- Gandigar
- Jegum
- Kalkot
- Sahib abad
- Shahi Kot
- Sheringal
- Thal
- Wari

#### Upper Kohistan

Count: 11

- Battera
- Dassu
- Dubair
- Herban
- Jalkot
- Karang
- Komella
- Looter
- Palas
- Pattan
- Sazeen

### Sindh

- No police-station dropdown in the FIR form for this province. The UI uses free-text `other_station_id`.

### Balochistan

- No police-station dropdown in the FIR form for this province. The UI uses free-text `other_station_id`.

### Azad Kashmir

- No police-station dropdown in the FIR form for this province. The UI uses free-text `other_station_id`.

### Gilgit-Baltistan

- No police-station dropdown in the FIR form for this province. The UI uses free-text `other_station_id`.

### Capital

- No police-station dropdown in the FIR form for this province. The UI uses free-text `other_station_id`.

