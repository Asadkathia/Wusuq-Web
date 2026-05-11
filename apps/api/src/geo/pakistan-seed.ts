// Generated from FORMS_REGIONS_DISTRICTS_CITIES_POLICE_STATIONS.md
// The source export does not contain authoritative district foreign keys for cities or city foreign keys for police stations.
// We preserve the exact source lists and infer district -> city groupings using curated hints plus name matching.

export const RAW_DISTRICTS_BY_PROVINCE = {
  'Punjab': ['Attock', 'Bahawalpur', 'Bhakkar', 'Bhawalnagar', 'Chakwal', 'Chiniot', 'Dera Ghazi Khan', 'Faisalabad', 'Gujranwala', 'Gujrat', 'Hafizabad', 'Jhang', 'Jhelum', 'Kasur', 'Khanewal', 'Khushab', 'Lahore', 'Layyah', 'Lodhran', 'Mandi Bahauddin', 'Mianwali', 'Multan', 'Murree', 'Muzaffargarh', 'Nankana Sahib', 'Narowal', 'Okara', 'Pakpattan', 'Rahim Yar Khan', 'Rajanpur', 'Rawalpindi', 'Sahiwal', 'Sargodha', 'Sheikhupura', 'Sialkot', 'Toba Tek Singh', 'Vehari'],
  'Khyber Pakhtunkhwa': ['Abbottabad', 'Bajaur', 'Bannu', 'Batagram', 'Buner', 'Charsadda', 'Dera Ismail Khan', 'Hangu', 'Haripur', 'Karak', 'Khyber', 'Kohat', 'Kolai Palas', 'Kurram', 'Lakki Marwat', 'Lower Chitral', 'Lower Dir', 'Lower Kohistan', 'Malakand Protected Area', 'Mansehra', 'Mardan', 'Mohmand', 'North Waziristan', 'Nowshera', 'Orakzai', 'Peshawar', 'Shangla', 'South Waziristan', 'Swabi', 'Swat', 'Tank', 'Torghar', 'Upper Chitral', 'Upper Dir', 'Upper Kohistan'],
  'Sindh': ['Badin', 'Dadu', 'Ghotki', 'Hyderabad', 'Jacobabad', 'Jamshoro', 'Kambar/Shahdad Kot', 'Karachi Central', 'Kashmor', 'Khairpur', 'Korangi', 'Larkana', 'Malir', 'Matiari', 'Mirpur Khas', 'Naushahro Feroze', 'Sanghar', 'Shaheed Benazirabad', 'Shikarpur', 'Sujawal', 'Sukkur', 'Tando Allahyar', 'Tando Muhammad Khan', 'Tharparkar', 'Thatta', 'Umerkot'],
  'Balochistan': ['Awaran', 'Barkhan', 'Chagai', 'Dera Bugti', 'Duki', 'Gwadar', 'Harnai', 'Jaffarabad', 'Jhal Magsi', 'Kachhi', 'Kalat', 'Kech', 'Kharan', 'Khuzdar', 'Killa Abdullah', 'Killa Saifullah', 'Kohlu', 'Lasbela', 'Loralai', 'Mastung', 'Musakhel', 'Nasirabad', 'Nushki', 'Panjgur', 'Pishin', 'Quetta', 'shaheed sikandarabad', 'Sherani', 'Sibi', 'Sohbatpur', 'Washuk', 'Zhob', 'Ziarat'],
  'Azad Jammu & Kashmir': ['Bagh', 'Bhimber', 'Hattian Bala', 'Haveli', 'Kotli', 'Mirpur', 'Muzaffarabad', 'Neelum', 'Poonch/Rawalkot', 'Sudhnutti/Pulandri'],
  'Gilgit-Baltistan': ['Astore', 'Darel', 'Diamer', 'Ghanche', 'Ghizer/Khizer', 'Gilgit', 'Gupis Yasin', 'Hunza', 'Kharmang', 'Nagar', 'Roundu', 'Shigar', 'Skardu', 'Tangir'],
  'Islamabad Capital Territory': ['Islamabad'],
} as const;

export const RAW_CITIES_BY_PROVINCE = {
  'Punjab': ['Ahmadpur East', 'Ahmedpur Sial', 'Ali Pur Chattha', 'Alipur', 'Arifwala', 'Athara Hazari', 'Attock', 'Bahawalnagar', 'Bahawalpur', 'Bhakkar', 'Bhalwal', 'Bhawana', 'Bhera', 'Burewala', 'Chak Jhumra', 'Chakwal', 'Chaubara', 'Chichawatni', 'Chiniot', 'Chishtian', 'Choa Saidan Shah', 'Chowk Sarwar Shaheed', 'Chunian', 'Dajal', 'Darya Khan', 'Daska', 'Depalpur', 'Dera Ghazi Khan', 'Dina', 'Dunyapur', 'Faisalabad', 'Fateh Jang', 'Firozwala', 'Fort Abbas', 'Gojra', 'Gujar Khan', 'Gujranwala', 'Gujrat', 'Hafizabad', 'Haroonabad', 'Hasilpur', 'Hassan Abdal', 'Hazro', 'Isa Khel', 'Jalal pur Jattan', 'Jalalpur Pirwala', 'Jampur', 'Jand', 'Jaranwala Town', 'Jatoi', 'Jehanian', 'Jhang', 'Jhelum', 'Kabirwala', 'Kahror Pakka', 'Kahuta', 'Kallar Kahar', 'Kallar Syedan', 'Kalur Kot', 'Kamalia', 'Kamoke', 'Karor Lal Esan', 'Kasur', 'Khairpur Tamewali', 'Khanewal', 'Khanpur', 'Kharian', 'Khushab/Joharabad', 'Koh-e-Suleman', 'Kot Addu', 'Kot Chutta', 'Kot Momin', 'Kot Radha Kishan', 'Kotli Sattian', 'Kunjah', 'Lahore', 'Lalian', 'Lawa', 'Layyah', 'Liaquatpur', 'Lodhran', 'Mailsi', 'Malakwal', 'Mandi Bahauddin', 'Mandi Shah Jeewna', 'Mankera', 'Mian Channu', 'Mianwali', 'Minchinabad', 'Muhammadpur', 'Multan', 'Murree', 'Muzaffargarh', 'Nankana Sahib', 'Narowal', 'Nowshehra/Waadi-e-Soon', 'Nowshera Virkan', 'Nurpur Thal', 'Okara', 'Pakpattan', 'Pasrur', 'Pattoki', 'Phalia', 'Pind Dadan Khan', 'Pindi Bhattian', 'Pindi Gheb', 'Piplan', 'Pir Mahal', 'Quaidabad', 'Rahim Yar Khan', 'Rajanpur', 'Rawalpindi', 'Renala Khurd', 'Rojhan', 'Sadiqabad', 'Safdarabad', 'Sahiwal', 'Sambrial', 'Sammundri Town', 'Sangla Hill', 'Sarai Alamgir', 'Sargodha', 'Shahkot', 'Shahpur', 'Shakargarh', 'Sheikhupura', 'Shorkot', 'Shujabad', 'Sialkot', 'Sillanwali', 'Sohawa', 'Talagang', 'Tandlianwala Town', 'Taunsa Sharif', 'Taxila', 'Toba Tek Singh', 'Vehari', 'Vehova', 'Wazirabad', 'Yazman', 'Zafarwal'],
  'Khyber Pakhtunkhwa': ['Abbottabad', 'Adenzai', 'Allai', 'Alpuri', 'Awaran', 'Babuzai (Swat)', 'Balakot', 'Banda Daud Shah', 'Bannu', 'Barikot', 'Batagram (Banna)', 'Behrain', 'Chagharzai', 'Chamla', 'Charbagh', 'Charsadda', 'Chitral', 'Daggar (Buner)', 'Daraban', 'Dassu', 'Dera Ismail Khan', 'Dir', 'Domel', 'Gadezai', 'Gagra', 'Ghazi', 'Gishkore', 'Hangu', 'Haripur', 'Havelian', 'Jahangira', 'Jhal Jhao', 'Kabal', 'Kandia', 'Karak', 'Katlang', 'Khwaza Khela', 'Kohat', 'Korak Jahoo', 'Kulachi', 'Lachi', 'Lahor', 'Lakki Marwat', 'Lal Qila', 'Mansehra', 'Mardan', 'Mashkai', 'Mastuj', 'Matta Shamzai', 'Mingora', 'Naurang', 'Nowshera', 'Oghi', 'Pabbi', 'Paharpur', 'Palas', 'Paroa', 'Pattan', 'Peshawar', 'Puran', 'Razar', 'Rustam', 'Sam Ranizai', 'Samarbagh (Barwa)', 'Shabqadar', 'Sharingal', 'Swabi', 'Swat Ranizai', 'Takht Bhai', 'Takht-E-Nasrati', 'Tall', 'Tangi', 'Tank', 'Temergara', 'Topi', 'Tor Ghar', 'Totalai', 'Wari'],
  'Sindh': ['Badin', 'Bakrani', 'Bhiria', 'Bulri Shah Karim', 'Chachro', 'Chamber', 'Dadu', 'Daharki', 'Daulatpur (Qazi Ahmed)', 'Daur', 'Dhali', 'Digri', 'Diplo', 'Dokri', 'Faiz Ganj', 'Gambat', 'Garhi Khairo', 'Garhi Yasin', 'Ghorabari', 'Ghotki', 'Golarchi', 'Hala', 'Hussain Bux Marri', 'Hyderabad', 'Islamkot', 'Jacobabad', 'Jam Nawaz Ali', 'Jamshoro', 'Jati', 'Jhando Mari', 'Jhuddo', 'Johi', 'Kaloi', 'Kambar', 'Kandhkot', 'Kandioro', 'Karachi', 'Kashmore', 'Keti Bunder', 'Khairpur', 'Khairpur Nathan Shah', 'Khangarh (Khanpur)', 'Khanpur', 'Kharo Chan', 'Khipro', 'Kingri', 'Kot Diji', 'Kot Ghulam Mohammad', 'Kotri', 'Kubo Saeed Khan', 'Kunri', 'Lakhi', 'Larkana', 'Latifabad', 'Malir', 'Manjhand', 'Matiari', 'Matli', 'Mehar', 'Mehrabpur', 'Miro Khan', 'Mirpur Bathoro', 'Mirpur Khas', 'Mirpur Mathelo', 'Mirpur Sakro', 'Mithi', 'Moro', 'Nagarparkar', 'Nara', 'Nasirabad', 'Naushahro Feroze', 'Nawabshah', 'Pano Aqil', 'Pithoro', 'Qasimabad', 'Rato Dero', 'Rohri', 'Saeedabad', 'Sakrand', 'Salehpat', 'Samaro', 'Sanghar', 'Sehwan Sharif', 'Shah Bunder', 'Shahdadkot', 'Shahdadpur', 'Shaheed Fazal Rahu', 'Shikarpur', 'Shujabad', 'Sindhri', 'Sinjhoro', 'Sobhodero', 'Sujawal', 'Sujawal Junejo', 'Sukkur', 'Talhar', 'Tando Adam', 'Tando Allahyar', 'Tando Bago', 'Tando Ghulam Hyder', 'Tando Mohammad Khan', 'Tangwani', 'Thano Bula Khan', 'Thari Mirwah', 'Thatta', 'Thul', 'Ubauro', 'Umerkot', 'Uthman Kot', 'Warah'],
  'Balochistan': ['Aranji', 'Ashwat', 'Baba Kot', 'Badini', 'Baghbana', 'Baiker', 'Balanari', 'Balnigor', 'Barkhan', 'Barshore', 'Bela', 'Besima', 'Bhag', 'Bori', 'Buleda', 'Chagai', 'Chaman', 'Chattar', 'Chiltan', 'Dak', 'Dalbandin', 'Dasht', 'Dera Bugti', 'Dera Murad Jamali', 'Dhadar', 'Dobani', 'Drug', 'Duki', 'Dureji', 'Faridabad', 'Gaddani', 'Gandakha', 'Gandawa', 'Gazg', 'Gichk', 'Gowargo', 'Greshek', 'Grisini', 'Gulistan', 'Gwadar', 'Harnai', 'Hayrvi', 'Hoshab', 'Hub', 'Hurramzai', 'Jhal Magsi', 'Jhat Pat', 'Jiwani', 'Johan', 'Kahan', 'Kalat', 'Kanmetharzai', 'Kanraj', 'Karakh', 'Karezat', 'Kashatu', 'Khad Koocha', 'Kharan', 'Khattan', 'Khoast', 'Khuzdar', 'Killa Abdullah', 'Killa Saifullah', 'Kingri', 'Kirdgap', 'Kohlu', 'Kutmandai', 'Lakhra', 'Lehri', 'Liari', 'Loiband', 'Loralai', 'Loti', 'Mach', 'Maiwand', 'Malam', 'Mand', 'Mangochar', 'Manjipur', 'Mashkhel', 'Mastung', 'Mekhtar', 'Mirpur', 'Moola', 'Musakhel', 'Muslim Bagh', 'Nag', 'Nall', 'Nokundi', 'Nushki', 'Ormara', 'Ornach', 'Panjgur', 'Panjpai', 'Paroom', 'Pasni', 'Phelawagh', 'Pir Koh', 'Pishin', 'Qamar Din Karez', 'Quetta', 'Sambaza', 'Sangan', 'Sangsillah', 'Sanni', 'Sar-Kharan', 'Saranan', 'Saroona', 'Shahgori', 'Sharigh', 'Sherani', 'Shinki', 'Sibi', 'Sinjavi', 'Sohbatpur', 'Sonmiani (Winder)', 'Sui', 'Suntsar', 'Surab', 'Taftan', 'Tamboo', 'Tohumulk', 'Toisar', 'Tump', 'Turbat', 'Usta Mohammad', 'Uthal', 'Wadh', 'Washuk', 'Zamuran', 'Zarghoon', 'Zehri', 'Zhob', 'Ziarat'],
  'Azad Jammu & Kashmir': ['Abbaspur', 'Ath Muqam', 'Bagh', 'Baloch', 'Barnala', 'Bhimber', 'Charoi', 'Chikar', 'Dheerkot', 'Dudyal', 'Dulia Jattian', 'Fateh Pur Thakiala (Nakial)', 'Garhi Dopatta (Garhi Dopatta)', 'Hajeera', 'Hari Gehal', 'Hattian Bala', 'Haveli', 'Khui Rtta', 'Khurshid Abad', 'Kotli', 'Lipa', 'Mang', 'Mirpur', 'Mumtazabad', 'Muzaffarabad', 'Pallandari', 'Patehka (Nasirabad)', 'Rawalakot', 'Samahni', 'Sehnsa', 'Sharda', 'Tarar Khal', 'Thorar'],
  'Gilgit-Baltistan': ['Aliabad', 'Astore', 'Babusar', 'Chalt', 'Chilas', 'Chorbut', 'Daghoni', 'Danyor', 'Darel', 'Gamba', 'Gilgit', 'Gojal', 'Gultari', 'Gupis', 'Haldi', 'Ishkoman', 'Juglot', 'Keris', 'Khaplu', 'Kharmang', 'Mashabrum', 'Nagar', 'Phander', 'Punial', 'Rondu', 'Shigar', 'Shounter', 'Skardu', 'Tangir', 'Yasin'],
  'Islamabad Capital Territory': ['Islamabad'],
} as const;

export const RAW_POLICE_STATIONS_BY_PROVINCE = {
  'Punjab': {
    'Attock': ['ANF', 'Anti Corruption', 'Attock Khurd', 'Basal', 'Bathar', 'City Attock', 'City Hassan Abdal', 'Fateh Jang', 'Hazro', 'Injra', 'Jand', 'New Air port', 'Pindigheb', 'Railway', 'Rangoo', 'Saddar Attock', 'Saddar Hassan Abdal'],
    'Bahawalpur': ['Abbas Nagar', 'Anit Corruption', 'Baghdad-ul-Jadeed', 'Cantt.', 'Chani Goth', 'Chowki Railway Ahmadpur East', 'City Ahmadpur East', 'City Hasilpur', 'City Yazman', 'Civil Lines', 'Dera Nawab Sahib', 'Derawar', 'Dhoor Kot', 'FIA', 'Head Rajkan', 'Inayati', 'Khairpur Tamewali', 'Kotwali', 'Musafir Khana', 'Nowshehra Jadid', 'Qaimpur', 'Railway Bahawalpur', 'Railway Khanpur', 'Railway Samma Satta', 'Saddar Ahmadpur East', 'Saddar Bahawalpur', 'Saddar Hasilpur', 'Saddar Yazman', 'Samma Sattta', 'Uch Sharif'],
    'Bhakkar': ['Anti Corruption Bhakkar', 'Behal Bhakkar', 'Chandni Chowk', 'City Bhakkar', 'City Darya Khan', 'Dullewala', 'Haidarabad', 'Jandanwala', 'Kalur Kot', 'Mankaira', 'Railway Bhakkar', 'Saddar Bhakkar', 'Saddar Darya Khan', 'Sara-e-Mohajar'],
    'Bhawalnagar': ['Anti Corruption', 'Bakhshan Khan', 'CIA', 'City A/Division Bahawalnagar', 'City A/Division Chishtian', 'City B/Division Bahawalnagar', 'City B/Division Chishtian', 'City Haroonabad', 'Dahranwala', 'Dunga Bunga', 'Faqirwali', 'Fortabbas', 'Ghumand Pur', 'Khichiwala', 'Maclod Gunj', 'Madrassa', 'Mandi Sadiq Gunj', 'Maroot', 'Minchinabad', 'Railway', 'Saddar Bahawalnagar', 'Saddar Chishtian', 'Saddar Haroonabad', 'Shaher Fareed', 'Takht Mahal'],
    'Chakwal': ['Choa Saidan Shah', 'City Chakwal', 'City Talagang', 'Dhudial', 'Duhman', 'Kallar Kahar', 'Lawa', 'Neela', 'Saddar Chakwal', 'Saddar Talagang', 'Tamman'],
    'Chiniot': ['Bhowana', 'Chenab Nagar', 'City', 'City Chiniot', 'Kanidwal', 'Kot Wasawa', 'Lalian', 'Langrana', 'Muhammad Wala', 'Railway Police Post', 'Rajoya', 'Saddar  Chiniot'],
    'Dera Ghazi Khan': ['Anti-Corruption', 'B-Division', 'BMP Post D.G.Khan', 'BMP Post Taunsa Sharif', 'Choti', 'City', 'City, Taunsa Sharif', 'Civil Line', 'Darhama', 'Darkhast Jamal Khan', 'FIA', 'Gaddai', 'Jhoke Utra', 'Kala', 'Kot Chutta', 'Kot Mubarak', 'Railway', 'Raitra', 'Saddar', 'Saddar, Taunsa Sharif', 'Sakhi Sarwar', 'Shah Saddar Din', 'Vehova'],
    'Faisalabad': ['ANF', 'Anti-Corruption', 'ATA', 'Bahlak', 'Balochni', 'Batala Colony', 'Buchiana', 'Chak Jhumra', 'Civil Lines', 'D-Type Colony', 'Dijkot', 'F.I.A.', 'Factory Area', 'FEDMC', 'G. M. Abad', 'Garh', 'Gulberg', 'Jaranwala City', 'Jaranwala Sadar', 'Jhang Bazar', 'Khurrianwala', 'Kotwali', 'Kurr', 'Lundianwala', 'Madina Town', 'Mamukanjan', 'Mansoor Abad', 'Millat Town', 'Muridwala', 'Nishat Abad', 'Peoples Colony', 'Rail Bazar', 'Railway', 'Railway Jaranwala', 'Raza Abad', 'Rodala Road', 'Roshanwala', 'Sadar', 'Sahianwala', 'Samanabad', 'Samundri City', 'Samundri Sadar', 'Sandal Bar', 'Sargodha Road', 'Satiana', 'Tandlianwala City', 'Tandlianwala Sadar', 'Tarkhani', 'Thikriwala', 'Women'],
    'Gujranwala': ['Ahmad Nagar', 'Ali Pur', 'Anti Corruption', 'Aroop', 'Baghbanpura', 'Cantt', 'CIA', 'City Kamoke', 'City Wazirabad', 'Civil Line', 'CTD', 'Dhullay', 'Eminabad', 'Ferozewala', 'FIA', 'Garjakh', 'Ghakhar Mandi', 'Jinnah Road', 'Khiali', 'Kot Ladha', 'Kotwali', 'Ladhewala Waraich', 'Model Town', 'Noushera Virkan', 'Peoples Colony', 'Police Line Gujranwala', 'Qilla Dedar Singh', 'Railway', 'Sabzi Mandi', 'Sadar Gujranwala', 'Sadar Kamoke', 'Sadar Wazirabad', 'Satellite Town', 'Sohdra', 'Tatlay Aali', 'Wahndo'],
    'Gujrat': ['A/Division', 'Anti Corruption', 'B/Division', 'Bolani', 'City Jalalpur Jattan', 'City Lalamusa', 'City Sarai Alamgir', 'Civil Line', 'Daulat Nagar', 'Dinga', 'FIA', 'Guliana', 'Industrial Estate Phase 2', 'Kakrali', 'Karianwala', 'Kharian Cantt.', 'Kunjah', 'Larry Adda', 'Mangowal', 'Railway', 'Rehmania', 'Sadar Gujrat', 'Sadar Jalapur Jattan', 'Sadar Kharian', 'Sadar Lalamusa', 'Sadar Sarai Alamgir', 'Shaheen Chowk', 'Tanda'],
    'Hafizabad': ['CITY HAFIZABAD', 'CITY PINDI BHATTIAN', 'JALAL PUR BHATTIAN', 'KALEKE MANDI', 'KASESAY', 'KASOKE', 'SADAR HAFIZABAD', 'SADAR PINDI BHATTIAN', 'SUKHEKE MANDI', 'VENEKE TARAR'],
    'Jhang': ['18-Hazari', 'Ahmad Pur Sial', 'City Jhang', 'City Shorkot', 'Garh Maharaja', 'Kot Shakir', 'Kotwali', 'Massan', 'Mochiwala', 'Qadir Pur', 'Railway', 'Sadar Jhang', 'Satellite Town', 'Shorkot Cannt.', 'Waryam'],
    'Jhelum': ['ANF Dina', 'Chotala', 'City', 'Civil Lines', 'Dina', 'Domeli', 'Jalalpur Sharif', 'Kala Gujran', 'Lilla', 'Mangla Cantt', 'Pind Dadan Khan', 'Railway', 'Saddar', 'Sohawa'],
    'Kasur': ['A Division', 'Allahabad', 'Anti Corruption', 'B Division', 'Changa Manga', 'City Chunian', 'City Pattoki', 'City Phool Nagar', 'Ganda Singh Wala', 'Kanganpur', 'Khudian', 'Kot Radha Kishan', 'Mandi Usman Wala', 'Mustafabad', 'Railway Kasur', 'Raja Jang', 'Sadar Chunian', 'Sadar Kasur', 'Sadar Pattoki', 'Sadar Phool Nagar', 'Sarai Mughal', 'Theh Sheikhum'],
    'Khanewal': ['Abdul Hakeem', 'Adda Baara Meel', 'Chab kallan', 'City Jehanian', 'City Kabirwala', 'City Khanewal', 'City Mianchannu', 'Hawaili koranga', 'Kacha Kho', 'Kohna', 'Makhdoom Pur', 'Nawan Shehar', 'Railway Kabirwala', 'Railway Khanewal', 'Railway Mianchannu', 'Saddar Kabirwala', 'Saddar Khanewal', 'Saddar Mianchannu', 'Sirae Saddhu', 'Thatha Sadiq Abad', 'Tulamba'],
    'Khushab': ['City Jauharabad', 'Jaura Kalan', 'Katha Saghral', 'Khushab', 'Mitha Tiwana', 'Naushera', 'Noorpur Thal', 'Quaidabad', 'Saddar Jauharabad'],
    'Lahore': ['Akbri Gate', 'Anti Corruption', 'Anti Narcotics Force', 'Badami Bagh', 'Baghbanpura', 'Barki', 'Batapur', 'Bhatti Gate', 'Chung', 'CIA', 'Civil Line', 'Custom House Cell', 'Data Darbar', 'Defence A', 'Defence B', 'Defence C', 'Factory Area', 'Faisal Town', 'FIA', 'Garden Town', 'Garhi Shahu', 'Gawal Mandi', 'Ghalib Market', 'Ghazia Abad', 'Green Town', 'Gujjar Pura', 'Gulberg', 'Gulshan Iqbal', 'Gulshan Ravi', 'Hair', 'Hanjarwal', 'Harbanspura', 'Hydyara', 'Ichhra', 'Iqbal Town', 'Islam Pura', 'Johar Town', 'Kahna', 'Kot Lakhpat', 'Lady Race Course', 'Larry Adda', 'Liaqat Abad', 'Lohari Gate', 'Lower Mall', 'Lyttan Road', 'Manawan', 'Manga Mandi', 'Masti Gate', 'Millat Park', 'Misri Shah', 'Mochi Gate', 'Model Town', 'Mozang', 'Mughalpura', 'Muslim Town', 'Mustafa Abad', 'Mustafa Town', 'Naseer Abad', 'Nawab Town', 'Nawan Kot', 'New Anarkali', 'Nishter Colony', 'North Cantt.', 'Noulakha', 'Old Anarkali', 'Qilla Gujjar Singh', 'Quaid e Azam Industrial Area', 'Race Course', 'Railway Lahore', 'Railway Mughalpura', 'Railway Raiwind', 'Raiwind', 'Rang Mahal', 'Ravi Road', 'Sabzazar', 'Samanabad', 'Sanda', 'Sarwar Road', 'Sattokatla', 'Shad Bagh', 'Shadman', 'Shafique Abad', 'Shahdara', 'Shahdara Town', 'Shalimar', 'Shera Kot', 'South Cantt.', 'Sundar', 'Tibi City', 'Town Ship', 'Wahdat Colony', 'Yakki Gate'],
    'Layyah': ['Anti Corruption', 'Choubara', 'Chowk Azam', 'City Layyah', 'Fateh Pur', 'FIA', 'Karor', 'Kot Sultan', 'Peer Jaggi', 'Railway', 'Saddar Layyah'],
    'Lodhran': ['City Dunya Pur', 'City Kehror Pacca', 'City Lodhran', 'Dhanote', 'Galley Wal', 'Jalla Arain', 'Qureshi Wala', 'Railway', 'Saddar Dunya Pur', 'Saddar Kehror Pacca', 'Saddar Lodhran'],
    'Mandi Bahauddin': ['Bhagat', 'City M.B.Din', 'Civil Line', 'Gojra', 'Kuthiala Sheikhan', 'Malakwal', 'Miana Gondal', 'Pahrianwali', 'Phalia', 'Qadirabad', 'Railway', 'Sadar M.B.Din'],
    'Mianwali': ['ANF', 'Anti Corruption', 'Bhangi Khel', 'Chakrala', 'Chapri', 'Chidru', 'City', 'Daud Khel', 'Easa Khel', 'Harnoli', 'Kala Bagh', 'Kamar Mushani', 'Kundian', 'Makrwal', 'Mochh', 'Musa Khel', 'Pai Khel', 'Phir Pehai', 'Piplan', 'Railway', 'Sadar', 'Wan Bachran'],
    'Multan': ['Alpha', 'ANF', 'Anti-Corruption', 'Bahauddin Zakriya', 'Basti Malook', 'Bohar Gate', 'Budhla Sant', 'Cantt Multan', 'Chehliyak', 'City Jalalpur Pirwala', 'City Shujabad', 'Custom', 'Dehli Gate', 'Dolat Gate', 'FIA', 'Gulgasht', 'Haram Gate', 'Jaleelabad', 'Kup', 'Lohari Gate', 'Makhdoom Rasheed', 'Mumtazabad', 'Muzafarabad', 'New Multan', 'Old Kotwali', 'Pak Gate', 'Qadir Pur Ran', 'Qutab Pur', 'Railway', 'Rajaram (Shujabad)', 'Saddar Jalalpur Pirwala', 'Saddar Multan', 'Saddar Shujabad', 'Seetal Marri', 'Shah Rukne Alam', 'Shah Shamas', 'Women Police Center'],
    'Muzaffargarh': ['Anti Corruption', 'Bait Mir Hazar', 'City Ali Pur', 'City Muzaffargarh', 'Civil Lines', 'Daira Din Panah', 'Jatoi', 'Khairpur Sadaat', 'Khangarh', 'Kot Addu', 'Kot Addu Saddar', 'Kundai', 'Mehmood Kot', 'Qasba Gujrat', 'Qureshi', 'Railway', 'Rangpur', 'Rohilanwali', 'Saddar Alipur', 'Saddar Muzaffargarh', 'Sanawan', 'Sarwar Shaheed', 'Sarwar Shaheed Saddar', 'Seetpur', 'Shah Jamal', 'Shehr Sultan'],
    'Nankana Sahib': ['Barra Ghar', 'City Nankana Sahib', 'City Sangla Hill', 'City Shahkot', 'Mandi Faiz Abad', 'Mangtawala', 'Railway Chuki Sangle Hill', 'Railway Jaranwala', 'Saddar Nankana Sahib', 'Saddar Sangla Hill', 'Saddar Shahkot', 'Syed wala', 'Warbartan'],
    'Narowal': ['Ahmad Abad', 'Anti Corruption', 'Baddo Malhi', 'Chak Amru', 'City Narowal', 'City Shakargarh', 'Kot Nainan', 'Lessar Kalan', 'Niddoke', 'Noor Kot', 'Railway Police Post', 'Rayya Khas', 'Saddar  Shakargarh', 'Saddar Narowal', 'Shah Gharib', 'Zafarwal'],
    'Okara': ['A-Division', 'Anti-corruption', 'B-Division', 'Basirpur', 'Cantt Okara', 'Chorasta Mian Khan', 'Chuchak', 'City Depalpur', 'City Renala Khurd', 'Gogera', 'Haveli Lakha', 'Hujra Shah Muqeem', 'Mandi Ahmad Abad', 'Railway Police Post, Basirpur', 'Railway Police Post, Okara', 'Ravi', 'Sadar Depalpur', 'Sadar Renala Khurd', 'Saddar Okara', 'Satghara', 'Shahbore', 'Shergarh'],
    'Pakpattan': ['Ahmed Yar', 'Anti-Corruption', 'Chak Bedi', 'City Arifwala', 'City Pakpattan', 'Dal Waryam', 'Farid Nagar', 'Kalyana', 'Malka Hans', 'Qabula Sharif', 'Railway Police Post', 'Rang Shah', 'Saddar Arifwala', 'Saddar Pakpattan'],
    'Rahim Yar Khan': ['Aab-e-Hayat', 'Abadpur', 'Ahmedpur Lama', 'Airport', 'Anti-Corruption', 'Bhong', 'Choki Railway RYK', 'City A Division', 'City B Division', 'City C Division', 'City Khanpur', 'City Liaqatpur', 'City Sadiqabad', 'FIA', 'Iqbalabad', 'Islam Garh', 'Kot Sabzal', 'Kot Samaba', 'Machka', 'Manthar', 'Pacca Laran', 'Railway Khanpur', 'Rukanpur', 'Sadar Sadiqabad', 'Saddar Khanpur', 'Saddar Liaqatpur', 'Saddar Rahim Yar Khan', 'Sehja', 'Shedani', 'Tabassam Shaheed', 'Taranda Muhammad Panah', 'Zahir Peer'],
    'Rajanpur': ['Bangla Ichaa', 'BMP Barra', 'BMP Bhandowala', 'BMP Chacha', 'BMP Dilber', 'BMP Dooli', 'BMP Harrand', 'BMP Jhatro', 'BMP Khaan', 'BMP Khalchas', 'BMP Khumbi', 'BMP Kot Rom', 'BMP Marri', 'BMP Mughal', 'BMP Muranj', 'BMP Nili Lakri', 'BMP Sheikhwala', 'City Fazilpur', 'City Jampur', 'City Rajanpur', 'Goth Mazari', 'Hajipur', 'Hanif Ghauri Shaheed Dajal', 'Harrand', 'Kot Mithan', 'Lal Garh', 'Muhammadpur', 'Rojhan', 'Sabzani', 'Saddar Fazilpur', 'Saddar Jampur', 'Saddar Rajanpur', 'Shahwali', 'Sonmiani', 'Umer Kot'],
    'Rawalpindi': ['ACE', 'Airport', 'ANF', 'Banni', 'Cantt.', 'Chakri', 'Chountra', 'City Rawalpindi', 'Civil Line', 'CTD', 'Dhamiyal', 'FIA', 'Ganjmandi', 'Gujar Khan', 'Jatli', 'Kahuta', 'Kallar Syedan', 'Kotli Sattian', 'Mandra', 'Morgah', 'Murree', 'Naseerabad', 'New Town', 'Patriata', 'Phagwari', 'Pir Wadhai', 'RA Bazar', 'Race Course', 'Railway', 'Ratta Amral', 'Rawat', 'Saddar Beroni', 'Saddar Wah Cantt.', 'Sadiqabad', 'Taxila', 'Wah Cantt.', 'Waris Khan', 'Westridge', 'Women'],
    'Sahiwal': ['Anti Corruption', 'Bahadar Shah', 'City Chichawatni', 'City Sahiwal', 'Civil Line', 'Dera Rahim', 'Fareed Town', 'Fateh Sher', 'Ghala Mandi', 'Ghaziabad', 'Harappa', 'Kameer', 'Kassowal', 'Noor Shah', 'Okanwala Bangla', 'Railway', 'Saddar Chichawatni', 'Shah Kot', 'Yousafwala'],
    'Sargodha': ['Anti-Corruption', 'Atta Shaheed', 'Bhagtanwala', 'Bhera', 'Cantt', 'City Bhalwal', 'City Sargodha', 'Factory Area', 'FIA', 'Jhal Chakian', 'Jhawarian', 'Karana', 'Kotmomin', 'Laksian', 'Mela', 'Miani', 'Midh Ranjha', 'Phullarwan', 'Railway', 'S. Town', 'Saddar Bhalwal', 'Saddar Sargodha', 'Sahiwal', 'Sajid Shaheed', 'Shahnikdar', 'Shahpur City', 'Shahpur Saddar', 'Sillanwali', 'Tirkhanwala', 'Urban Area'],
    'Sheikhupura': ['A-Division City', 'Anti Corruption', 'B-Division City', 'Bhikhi', 'CIA', 'City Farooqabad', 'City Muridke', 'Factory Area', 'Ferozewala', 'Housing Colony', 'Khanqah Dogran', 'Mananwala', 'Narang Mandi', 'Railway Police', 'Sadar Farooqabad', 'Sadar Muridke', 'Sadar Sheikhupura', 'Safdarabad', 'Sharqpur Sharif'],
    'Sialkot': ['Airport', 'ANF', 'Anti Corruption', 'Badiana', 'Bambhanwala', 'Begowala', 'Cantt', 'City Daska', 'City Pasrur', 'Civil Line', 'Haji Pura', 'Head Marala', 'Kotli Loharan', 'Kotli Said Mir', 'Kotowali', 'Motra', 'Murad Pur', 'Neka Pura', 'Phaloura', 'Phukliyan', 'Qila Kalarwala', 'Railway Police', 'Rang Pura', 'Sabzpir', 'Sadar Daska', 'Sadar Pasrur', 'Sadar Sialkot', 'Sambrial', 'Satrah', 'Ugoki'],
    'Toba Tek Singh': ['Aroti', 'Bhussi', 'Chuttiana', 'City Gojra', 'City Kamalia', 'City Toba', 'Nawan Lahore', 'Pir Mehal', 'Rajana', 'Saddar Gojra', 'Saddar Kamalia', 'Saddar Toba'],
    'Vehari': ['Adda Jhal Sial', 'Anti-Corruption', 'City Burewala', 'City Mailsi', 'City Vehari', 'Danewal', 'Fateh Shah', 'FIA', 'Gaggo', 'Garah Morh', 'Karam Pur', 'Ludden', 'Machiwal', 'Meera Pur', 'Mitroo', 'Model Town', 'Railway', 'Saddar Burewala', 'Saddar Mailsi', 'Saddar Vehari', 'Sahuka', 'Sheikh Fazil', 'Thingi', 'Tibba Sultan Pur'],
  },
  'Khyber Pakhtunkhwa': {
    'Abbottabad': ['Bagnotar', 'Bakot', 'Cantt', 'City', 'Havelian', 'Lora', 'Mirpur', 'Nara', 'Nathiagali', 'Nawansher', 'Sherwan', 'Women Police Station'],
    'Bajaur': [],
    'Bannu': ['Bakka Khel', 'Basya Khel', 'Cantt', 'Domel', 'Ghori wala', 'Jani Khel', 'Johar', 'Kaki', 'Mairian', 'Mandan', 'Saddar', 'Township'],
    'Batagram': ['Banna', 'Battagram', 'Changle', 'Kuza Banda', 'Pazang', 'Shamlai'],
    'Buner': ['Chinglai', 'Dagger', 'Gul bandi', 'Jawar', 'Nawagai', 'Ningarai', 'Pir Baba', 'Totalai'],
    'Charsadda': ['Battagram', 'Charsadda', 'Khanmai', 'Khawajawas Koroona', 'Mandani', 'Nisatta', 'Prang', 'Sardheri', 'Shabqadar', 'Sro-Killi', 'Tangi', 'Tarnab', 'Umarzai'],
    'Dera Ismail Khan': ['Band Kurai', 'Cantt', 'Chodwan', 'City', 'Daraban', 'Dera Town', 'GomalUniversity', 'Kirri Khaisore', 'Kulachi', 'Paharpur', 'Panyala', 'Paroa', 'Saddar', 'Yark'],
    'Hangu': ['Bilyamina', 'City Hangu', 'Doaba', 'Saddar', 'Thall'],
    'Haripur': ['Beer', 'Cantt', 'City', 'Ghazi', 'Hattar', 'K.T.S', 'Khanpur', 'Kotnajeebullah', 'Nara Amazai', 'Sarai Saleh'],
    'Karak': ['Bandadaud Shah', 'Gurguri', 'Karak', 'Khuram', 'Latambar', 'Sabir Abad', 'Shah Saleem', 'Takhat Nasrati', 'Terri'],
    'Khyber': [],
    'Kohat': ['Bilitang', 'Cantt', 'Gumbat', 'Jangalkhel', 'Jarma', 'Kaghazai', 'KDA', 'Lachi', 'Saddar', 'Shakardara', 'Ustermzai'],
    'Kolai Palas': [],
    'Kurram': [],
    'Lakki Marwat': ['Dodiwala', 'Ghazni Khel', 'Lakki', 'Naurang', 'Pezu', 'Tajori'],
    'Lower Chitral': ['Arando', 'Ayun', 'Bumburate', 'Buni', 'Chitral', 'Darosh', 'Koghozi', 'Lotkoh', 'Mastooj', 'Mulkoh', 'Shaghoor', 'Sher Koh'],
    'Lower Dir': ['Asbnar', 'Balambat', 'Chakdara', 'Hayaserai', 'Khal', 'Lal Qilla', 'Mayar', 'Munda', 'Ouch', 'Samar Bagh', 'Talash', 'Timergara', 'Zimdara'],
    'Lower Kohistan': ['Battera', 'Dassu', 'Dubair', 'Herban', 'Jalkot', 'Karang', 'Komella', 'Looter', 'Palas', 'Pattan', 'Sazeen'],
    'Malakand Protected Area': [],
    'Mansehra': ['Bafa', 'Balakot', 'Battale', 'Cantt', 'City', 'Darband', 'Garhi Habibullah', 'Kaghan', 'Khaki', 'Lasan Nawab', 'Oghi', 'Pulra', 'Shinkyari'],
    'Mardan': ['Choora', 'City', 'Garhi Kapura', 'Hoti', 'Jabbar', 'Katlang', 'Kharaki', 'Lundkhuwar', 'Par Hoti', 'Rustam', 'Saddar', 'SaroShah', 'ShahbazGarhi', 'SheikhMaltoon', 'SherGarh', 'TakhtBhai', 'Toru'],
    'Mohmand': [],
    'North Waziristan': [],
    'Nowshera': ['AkbarPura', 'Akora', 'Azakhel', 'Nizam pur', 'Nowshera Cantt', 'Nowshera Kalan', 'Pabbi', 'Risalpur'],
    'Orakzai': [],
    'Peshawar': ['Badaber', 'Bannamari', 'Chamkani', 'Daudzai', 'Eastcantt', 'Faqirabad', 'Gulbahar', 'Gulbarg', 'Hashtnagri', 'Hayatabad', 'Kabuli', 'Khazana', 'Kotwali', 'Mathra', 'Mattani', 'Michni Gate', 'Nasirbagh', 'Phandu', 'Pharipura', 'Pishtakhara', 'Regi', 'Sarband', 'Shahqabool', 'Suburb', 'Tatara', 'Tehkal', 'UniversityTown', 'Urmer', 'Westcantt', 'Women Police Station'],
    'Shangla': ['Aloch', 'Alpuri', 'Bisham', 'Chakisar', 'Kamach', 'Karora', 'Martong'],
    'South Waziristan': [],
    'Swabi': ['I.D.S', 'Kalukhan', 'Lahor', 'Parmoli', 'Swabi', 'Topi', 'Utla', 'Yar Hussain', 'Zaida'],
    'Swat': ['Banr', 'Behrain', 'Charbagh', 'Chuprail', 'Ghaligai', 'Kabbal', 'Kalakot', 'Kalam', 'Kanju', 'Khwaza Khela', 'Kokarai', 'Madyan', 'Malam Jabba', 'Manglawar', 'Matta', 'Mingora', 'Rahimabad', 'Sadu Sharif', 'Shah Dhari', 'Shamozai'],
    'Tank': ['Gomal', 'Gul Imam', 'Mulazi', 'Tank'],
    'Torghar': ['Darbani', 'Judbah', 'Karor'],
    'Upper Chitral': ['Arando', 'Ayun', 'Bumburate', 'Buni', 'Chitral', 'Darosh', 'Koghozi', 'Lotkoh', 'Mastooj', 'Mulkoh', 'Shaghoor', 'Sher Koh'],
    'Upper Dir': ['Barawal', 'Dir', 'Gandigar', 'Jegum', 'Kalkot', 'Sahib abad', 'Shahi Kot', 'Sheringal', 'Thal', 'Wari'],
    'Upper Kohistan': ['Battera', 'Dassu', 'Dubair', 'Herban', 'Jalkot', 'Karang', 'Komella', 'Looter', 'Palas', 'Pattan', 'Sazeen'],
  },
  'Sindh': {},
  'Balochistan': {},
  'Azad Jammu & Kashmir': {},
  'Gilgit-Baltistan': {},
  'Islamabad Capital Territory': {},
} as const;

type SeedDistrict = {
  name: string;
  cities: string[];
};

type SeedProvince = {
  name: string;
  districts: SeedDistrict[];
};

const DISTRICT_CITY_HINTS = {
  'Punjab': {
    'Attock': ['Fateh Jang', 'Hassan Abdal', 'Hazro', 'Jand', 'Pindi Gheb'],
    'Bahawalpur': ['Ahmadpur East', 'Hasilpur', 'Yazman', 'Khairpur Tamewali'],
    'Bhawalnagar': ['Bahawalnagar', 'Chishtian', 'Fort Abbas', 'Haroonabad', 'Minchinabad'],
    'Bhakkar': ['Darya Khan', 'Kalur Kot', 'Mankera'],
    'Chakwal': ['Choa Saidan Shah', 'Kallar Kahar', 'Lawa', 'Talagang'],
    'Chiniot': ['Bhawana', 'Lalian'],
    'Dera Ghazi Khan': ['Dajal', 'Kot Chutta', 'Taunsa Sharif', 'Koh-e-Suleman', 'Vehova'],
    'Faisalabad': ['Chak Jhumra', 'Jaranwala Town', 'Sammundri Town', 'Tandlianwala Town'],
    'Gujranwala': ['Ali Pur Chattha', 'Kamoke', 'Nowshera Virkan', 'Wazirabad'],
    'Gujrat': ['Jalal pur Jattan', 'Kharian', 'Kunjah', 'Sarai Alamgir'],
    'Hafizabad': ['Pindi Bhattian'],
    'Jhang': ['Ahmedpur Sial', 'Athara Hazari', 'Mandi Shah Jeewna', 'Shorkot'],
    'Jhelum': ['Dina', 'Pind Dadan Khan', 'Sohawa'],
    'Kasur': ['Chunian', 'Kot Radha Kishan', 'Pattoki'],
    'Khanewal': ['Jehanian', 'Kabirwala', 'Mian Channu'],
    'Khushab': ['Khushab/Joharabad', 'Nowshehra/Waadi-e-Soon', 'Nurpur Thal', 'Quaidabad'],
    'Lahore': [],
    'Layyah': ['Chaubara', 'Karor Lal Esan'],
    'Lodhran': ['Dunyapur', 'Kahror Pakka'],
    'Mandi Bahauddin': ['Malakwal', 'Phalia'],
    'Mianwali': ['Isa Khel', 'Piplan'],
    'Multan': ['Jalalpur Pirwala', 'Shujabad'],
    'Muzaffargarh': ['Alipur', 'Chowk Sarwar Shaheed', 'Jatoi', 'Kot Addu'],
    'Nankana Sahib': ['Sangla Hill', 'Shahkot'],
    'Narowal': ['Shakargarh', 'Zafarwal'],
    'Okara': ['Depalpur', 'Renala Khurd'],
    'Pakpattan': ['Arifwala'],
    'Rahim Yar Khan': ['Khanpur', 'Liaquatpur', 'Sadiqabad'],
    'Rajanpur': ['Jampur', 'Rojhan'],
    'Rawalpindi': ['Gujar Khan', 'Kahuta', 'Kallar Syedan', 'Kotli Sattian', 'Taxila'],
    'Murree': ['Murree'],
    'Sahiwal': ['Chichawatni'],
    'Sargodha': ['Bhalwal', 'Bhera', 'Kot Momin', 'Sahiwal', 'Shahpur', 'Sillanwali'],
    'Sheikhupura': ['Firozwala', 'Muridke', 'Safdarabad'],
    'Sialkot': ['Daska', 'Pasrur', 'Sambrial'],
    'Toba Tek Singh': ['Gojra', 'Kamalia', 'Pir Mahal'],
    'Vehari': ['Burewala', 'Mailsi'],
  },
  'Khyber Pakhtunkhwa': {
    'Abbottabad': ['Havelian'],
    'Bannu': ['Domel'],
    'Batagram': ['Allai', 'Batagram (Banna)'],
    'Buner': ['Chagharzai', 'Chamla', 'Daggar (Buner)', 'Gagra', 'Totalai'],
    'Charsadda': ['Shabqadar', 'Tangi'],
    'Dera Ismail Khan': ['Daraban', 'Kulachi', 'Paharpur', 'Paroa'],
    'Hangu': ['Tall'],
    'Haripur': ['Ghazi'],
    'Karak': ['Banda Daud Shah', 'Takht-E-Nasrati'],
    'Kohat': ['Lachi'],
    'Lakki Marwat': ['Naurang'],
    'Lower Chitral': ['Chitral'],
    'Lower Dir': ['Adenzai', 'Lal Qila', 'Samarbagh (Barwa)', 'Temergara'],
    'Lower Kohistan': ['Palas', 'Pattan'],
    'Malakand Protected Area': ['Sam Ranizai', 'Swat Ranizai'],
    'Mansehra': ['Balakot', 'Oghi'],
    'Mardan': ['Katlang', 'Rustam', 'Takht Bhai'],
    'Nowshera': ['Jahangira', 'Pabbi'],
    'Peshawar': ['Peshawar'],
    'Shangla': ['Alpuri', 'Puran'],
    'Swabi': ['Lahor', 'Razar', 'Swabi', 'Topi'],
    'Swat': ['Babuzai (Swat)', 'Barikot', 'Behrain', 'Charbagh', 'Kabal', 'Khwaza Khela', 'Matta Shamzai', 'Mingora'],
    'Tank': ['Tank'],
    'Torghar': ['Tor Ghar'],
    'Upper Chitral': ['Mastuj'],
    'Upper Dir': ['Dir', 'Gishkore', 'Sharingal', 'Wari'],
    'Upper Kohistan': ['Dassu', 'Kandia'],
  },
  'Sindh': {
    'Badin': ['Golarchi', 'Matli', 'Talhar', 'Tando Bago'],
    'Dadu': ['Dadu', 'Johi', 'Khairpur Nathan Shah', 'Mehar'],
    'Ghotki': ['Daharki', 'Mirpur Mathelo', 'Ubauro'],
    'Hyderabad': ['Latifabad', 'Qasimabad'],
    'Jacobabad': ['Garhi Khairo', 'Thul'],
    'Jamshoro': ['Jamshoro', 'Kotri', 'Manjhand', 'Thano Bula Khan'],
    'Kambar/Shahdad Kot': ['Kambar', 'Miro Khan', 'Nasirabad', 'Shahdadkot', 'Warah'],
    'Karachi Central': ['Karachi Central', 'Karachi East', 'Karachi South', 'Karachi West'],
    'Kashmor': ['Kandhkot', 'Kashmore', 'Tangwani'],
    'Khairpur': ['Faiz Ganj', 'Gambat', 'Kingri', 'Kot Diji', 'Nara', 'Sobhodero', 'Thari Mirwah'],
    'Korangi': ['Korangi'],
    'Larkana': ['Bakrani', 'Dokri', 'Rato Dero'],
    'Malir': ['Malir'],
    'Matiari': ['Hala', 'Matiari', 'Saeedabad'],
    'Mirpur Khas': ['Digri', 'Jhuddo', 'Kot Ghulam Mohammad', 'Sindhri'],
    'Naushahro Feroze': ['Bhiria', 'Kandioro', 'Mehrabpur', 'Moro', 'Naushahro Feroze'],
    'Sanghar': ['Jam Nawaz Ali', 'Khipro', 'Sanghar', 'Shahdadpur', 'Sinjhoro', 'Tando Adam'],
    'Shaheed Benazirabad': ['Daulatpur (Qazi Ahmed)', 'Daur', 'Nawabshah', 'Sakrand'],
    'Shikarpur': ['Garhi Yasin', 'Lakhi'],
    'Sujawal': ['Bulri Shah Karim', 'Ghorabari', 'Jati', 'Keti Bunder', 'Kharo Chan', 'Mirpur Bathoro', 'Shah Bunder'],
    'Sukkur': ['Pano Aqil', 'Rohri', 'Salehpat'],
    'Tando Allahyar': ['Chamber', 'Jhando Mari', 'Tando Allahyar'],
    'Tando Muhammad Khan': ['Tando Ghulam Hyder', 'Tando Mohammad Khan'],
    'Tharparkar': ['Chachro', 'Diplo', 'Islamkot', 'Kaloi', 'Mithi', 'Nagarparkar'],
    'Thatta': ['Thatta', 'Mirpur Sakro'],
    'Umerkot': ['Kunri', 'Pithoro', 'Samaro', 'Umerkot', 'Uthman Kot'],
  },
  'Balochistan': {
    'Awaran': ['Awaran', 'Gishkore', 'Jhal Jhao', 'Mashkai'],
    'Barkhan': ['Barkhan'],
    'Chagai': ['Chagai', 'Dalbandin', 'Nokundi', 'Taftan'],
    'Dera Bugti': ['Dera Bugti', 'Pir Koh', 'Sui'],
    'Duki': ['Duki'],
    'Gwadar': ['Gwadar', 'Jiwani', 'Ormara', 'Pasni'],
    'Harnai': ['Harnai', 'Sharigh'],
    'Jaffarabad': ['Gandakha', 'Jhat Pat', 'Usta Mohammad'],
    'Jhal Magsi': ['Gandawa', 'Jhal Magsi'],
    'Kachhi': ['Bhag', 'Dhadar'],
    'Kalat': ['Kalat', 'Mangochar', 'Surab'],
    'Kech': ['Buleda', 'Dasht', 'Hoshab', 'Mand', 'Tump', 'Turbat'],
    'Kharan': ['Kharan'],
    'Khuzdar': ['Baghbana', 'Khuzdar', 'Wadh', 'Zehri'],
    'Killa Abdullah': ['Badini', 'Chaman', 'Killa Abdullah'],
    'Killa Saifullah': ['Killa Saifullah', 'Muslim Bagh'],
    'Kohlu': ['Kohlu'],
    'Lasbela': ['Bela', 'Hub', 'Sonmiani (Winder)', 'Uthal'],
    'Loralai': ['Bori', 'Loralai', 'Mekhtar'],
    'Mastung': ['Mastung'],
    'Musakhel': ['Musakhel'],
    'Nasirabad': ['Dera Murad Jamali', 'Tamboo'],
    'Nushki': ['Nushki'],
    'Panjgur': ['Panjgur'],
    'Pishin': ['Gulistan', 'Pishin', 'Saranan'],
    'Quetta': ['Chiltan', 'Quetta', 'Zarghoon'],
    'Sherani': ['Sherani'],
    'Sibi': ['Lehri', 'Sibi'],
    'Sohbatpur': ['Faridabad', 'Sohbatpur'],
    'Washuk': ['Besima', 'Washuk'],
    'Zhob': ['Qamar Din Karez', 'Zhob'],
    'Ziarat': ['Ziarat'],
  },
  'Azad Jammu & Kashmir': {
    'Bagh': ['Bagh', 'Dheerkot'],
    'Bhimber': ['Barnala', 'Bhimber', 'Samahni'],
    'Hattian Bala': ['Chikar', 'Hattian Bala', 'Lipa'],
    'Haveli': ['Hajeera', 'Haveli'],
    'Kotli': ['Charoi', 'Fateh Pur Thakiala (Nakial)', 'Khui Rtta', 'Kotli', 'Sehnsa'],
    'Mirpur': ['Dudyal', 'Dulia Jattian', 'Mirpur'],
    'Muzaffarabad': ['Garhi Dopatta (Garhi Dopatta)', 'Mumtazabad', 'Muzaffarabad', 'Patehka (Nasirabad)'],
    'Neelum': ['Ath Muqam', 'Sharda'],
    'Poonch/Rawalkot': ['Abbaspur', 'Baloch', 'Hari Gehal', 'Rawalakot', 'Thorar'],
    'Sudhnutti/Pulandri': ['Mang', 'Pallandari', 'Tarar Khal'],
  },
  'Gilgit-Baltistan': {
    'Astore': ['Astore', 'Shounter'],
    'Darel': ['Darel'],
    'Diamer': ['Babusar', 'Chilas'],
    'Ghanche': ['Chorbut', 'Haldi', 'Keris', 'Khaplu', 'Mashabrum'],
    'Ghizer/Khizer': ['Ishkoman', 'Phander', 'Punial'],
    'Gilgit': ['Danyor', 'Gilgit', 'Juglot'],
    'Gupis Yasin': ['Gupis', 'Yasin'],
    'Hunza': ['Aliabad', 'Gojal'],
    'Kharmang': ['Gultari', 'Kharmang'],
    'Nagar': ['Chalt', 'Nagar'],
    'Roundu': ['Rondu'],
    'Shigar': ['Shigar'],
    'Skardu': ['Skardu'],
    'Tangir': ['Daghoni', 'Tangir'],
  },
  'Islamabad Capital Territory': {
    'Islamabad': ['Islamabad'],
  },
} as const;

function normalizeLocationName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\/()-]/g, ' ')
    .replace(/\b(city|town|district|division|tehsil|cantt|cantonment|sharif|model)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSimilarityScore(input: string, candidate: string) {
  if (!input || !candidate) return 0;
  if (input === candidate) return 100;
  if (input.includes(candidate) || candidate.includes(input)) return 90;

  const inputTokens = new Set(input.split(' '));
  const candidateTokens = new Set(candidate.split(' '));
  let overlap = 0;
  for (const token of inputTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  return overlap * 18;
}

function pickDistrictForCity(
  provinceName: keyof typeof RAW_DISTRICTS_BY_PROVINCE,
  cityName: string,
  districts: readonly string[],
) {
  if (!districts.length) {
    return '';
  }
  const normalizedCity = normalizeLocationName(cityName);
  const provinceHints =
    DISTRICT_CITY_HINTS[provinceName as keyof typeof DISTRICT_CITY_HINTS] ?? {};
  const provinceStations =
    RAW_POLICE_STATIONS_BY_PROVINCE[
      provinceName as keyof typeof RAW_POLICE_STATIONS_BY_PROVINCE
    ] ?? {};

  let bestDistrict = districts[0] ?? '';
  let bestScore = -1;

  for (const districtName of districts) {
    const normalizedDistrict = normalizeLocationName(districtName);
    const explicitHints = (provinceHints as Record<string, readonly string[]>)[districtName] ?? [];
    const normalizedHints = explicitHints.map(normalizeLocationName);
    const policeStations =
      (provinceStations as Record<string, readonly string[]>)[districtName] ?? [];
    const normalizedStations = policeStations.map(normalizeLocationName);

    let score = buildSimilarityScore(normalizedCity, normalizedDistrict);

    for (const hint of normalizedHints) {
      score = Math.max(score, buildSimilarityScore(normalizedCity, hint));
    }

    for (const station of normalizedStations) {
      score = Math.max(score, buildSimilarityScore(normalizedCity, station));
    }

    if (score > bestScore) {
      bestScore = score;
      bestDistrict = districtName;
    }
  }

  return bestDistrict;
}

function buildDistrictsForProvince(
  provinceName: keyof typeof RAW_DISTRICTS_BY_PROVINCE,
): SeedDistrict[] {
  const districts = [...RAW_DISTRICTS_BY_PROVINCE[provinceName]];
  const sourceCities = RAW_CITIES_BY_PROVINCE[provinceName] ?? [];
  const districtMap = new Map<string, string[]>();

  for (const districtName of districts) {
    districtMap.set(districtName, []);
  }

  for (const cityName of sourceCities) {
    const districtName = pickDistrictForCity(provinceName, cityName, districts);
    const cities = districtMap.get(districtName);
    if (cities && !cities.includes(cityName)) {
      cities.push(cityName);
    }
  }

  return districts.map((districtName) => {
    const cities = districtMap.get(districtName) ?? [];
    if (!cities.length) {
      cities.push(districtName);
    }
    return { name: districtName, cities };
  });
}

export const PAKISTAN_GEO: SeedProvince[] = Object.keys(
  RAW_DISTRICTS_BY_PROVINCE,
).map((provinceName) => ({
  name: provinceName,
  districts: buildDistrictsForProvince(
    provinceName as keyof typeof RAW_DISTRICTS_BY_PROVINCE,
  ),
}));
